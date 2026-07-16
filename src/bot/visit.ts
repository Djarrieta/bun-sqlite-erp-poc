/**
 * Audio → bitácora pipeline (bot side). After the bot transcribes a voice/audio
 * message, this asks DeepSeek whether the message is a visit log and, if so,
 * extracts a summary, the mentioned company/project, and action items. It then
 * stores the audio under data/audio/ (shared with the web via the ./data
 * volume) and creates a `telegram` visit with its action items. The web shows
 * the result and lets the user turn action items into tasks.
 *
 * If the message is NOT a visit, `tryLogVisit` returns `{ handled: false }` so
 * the caller falls back to the normal agent (query) flow.
 */
import { mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { can } from "../core/permissions.ts";
import type { User } from "../auth/auth.db.ts";
import { CompanyRepository, type Company } from "../modules/companies/companies.db.ts";
import { ProjectRepository, type Project } from "../modules/projects/projects.db.ts";
import { VisitRepository } from "../modules/visits/visits.db.ts";
import { VISITS_MODULE } from "../modules/visits/visits.rules.ts";
import { deepseek } from "./deepseek.ts";

const AUDIO_DIR = "data/audio";
const MIME_EXTENSIONS: Record<string, string> = {
  "audio/ogg": "ogg",
  "audio/oga": "oga",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/webm": "webm",
  "audio/flac": "flac",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
};

const companies = new CompanyRepository();
const projects = new ProjectRepository();
const visits = new VisitRepository();

interface VisitExtraction {
  isVisit: boolean;
  summary: string;
  companyName: string | null;
  projectName: string | null;
  actionItems: string[];
}

const EXTRACTION_PROMPT = `Eres un asistente que clasifica mensajes de voz de un comercial (vendedor).
Decide si el mensaje es el registro de una VISITA/bitácora a una compañía o proyecto
(por ejemplo: "estuve en...", "visité...", "reunión con...", "registra visita...").

Responde ÚNICAMENTE con un objeto JSON válido, sin texto adicional, con esta forma:
{
  "is_visit": boolean,
  "summary": string,        // resumen breve en español de la visita (vacío si no es visita)
  "company_name": string|null, // nombre de la compañía mencionada, o null
  "project_name": string|null, // nombre del proyecto mencionado, o null
  "action_items": string[]  // lista de acciones/pendientes concretos detectados (vacío si no hay)
}

Si el mensaje NO es una visita (es una consulta, pregunta o comando), responde con is_visit=false y el resto vacío.`;

/** LangChain message content can be a string or an array of blocks. */
function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c) => (typeof c === "string" ? c : ((c as { text?: string }).text ?? "")))
      .join("");
  return String(content ?? "");
}

/** Pull a JSON object out of a model reply that may wrap it in prose/fences. */
function parseJsonObject(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Ask DeepSeek to classify + extract the visit fields from a transcript. */
async function extractVisit(transcript: string): Promise<VisitExtraction | null> {
  const llm = deepseek();
  const ai = await llm.invoke([
    new SystemMessage(EXTRACTION_PROMPT),
    new HumanMessage(transcript.slice(0, 6000)),
  ]);
  const parsed = parseJsonObject(contentToString(ai.content));
  if (!parsed) return null;
  const actionItems = Array.isArray(parsed.action_items)
    ? parsed.action_items.map((x) => String(x).trim()).filter(Boolean).slice(0, 20)
    : [];
  return {
    isVisit: parsed.is_visit === true,
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : "",
    companyName:
      typeof parsed.company_name === "string" && parsed.company_name.trim()
        ? parsed.company_name.trim()
        : null,
    projectName:
      typeof parsed.project_name === "string" && parsed.project_name.trim()
        ? parsed.project_name.trim()
        : null,
    actionItems,
  };
}

/** Best-effort resolve a company by name or code (case-insensitive). */
function resolveCompany(name: string | null): Company | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const list = companies.activeList();
  return (
    list.find((c) => c.name.toLowerCase() === n) ??
    list.find((c) => c.code.toLowerCase() === n) ??
    list.find(
      (c) => c.name.toLowerCase().includes(n) || n.includes(c.name.toLowerCase())
    ) ??
    null
  );
}

/** Best-effort resolve a project by name or code (case-insensitive). */
function resolveProject(name: string | null): Project | null {
  if (!name) return null;
  const n = name.toLowerCase();
  const list = projects.selectList();
  return (
    list.find((p) => p.name.toLowerCase() === n) ??
    list.find((p) => p.code.toLowerCase() === n) ??
    list.find(
      (p) => p.name.toLowerCase().includes(n) || n.includes(p.name.toLowerCase())
    ) ??
    null
  );
}

/** Persist the audio buffer under data/audio/ and return its filename. */
async function saveAudio(buffer: Buffer, mimeType: string): Promise<string> {
  await mkdir(AUDIO_DIR, { recursive: true });
  const ext = MIME_EXTENSIONS[mimeType] ?? "ogg";
  const name = `${randomUUID()}.${ext}`;
  await Bun.write(`${AUDIO_DIR}/${name}`, buffer);
  return name;
}

export interface AudioPayload {
  buffer: Buffer;
  mimeType: string;
}

export interface VisitLogResult {
  /** True when the message was a visit and was handled here (no agent fallback). */
  handled: boolean;
  /** Telegram reply to send when handled. */
  reply?: string;
}

/**
 * Try to log a visit from a transcribed audio message. Returns
 * `{ handled: false }` when the message is not a visit (caller should fall back
 * to the agent). On success, saves the audio, creates the visit + action items,
 * and returns a Telegram-ready confirmation.
 */
export async function tryLogVisit(
  user: User,
  transcript: string,
  audio: AudioPayload
): Promise<VisitLogResult> {
  let extraction: VisitExtraction | null;
  try {
    extraction = await extractVisit(transcript);
  } catch (err) {
    console.error("[bot] visit extraction error:", err);
    return { handled: false };
  }
  if (!extraction || !extraction.isVisit) return { handled: false };

  if (!can(user, VISITS_MODULE, "create")) {
    return {
      handled: true,
      reply: "🔒 No tienes permiso para registrar bitácoras.",
    };
  }

  const project = resolveProject(extraction.projectName);
  const company =
    resolveCompany(extraction.companyName) ??
    (project ? companies.get(project.company_id) : null);

  let audioPath = "";
  try {
    audioPath = await saveAudio(audio.buffer, audio.mimeType);
  } catch (err) {
    console.error("[bot] audio save error:", err);
  }

  const visit = visits.createFromTelegram(
    {
      companyId: company?.id ?? null,
      projectId: project?.id ?? null,
      transcript,
      summary: extraction.summary,
      audioPath,
    },
    user.id
  );
  if (extraction.actionItems.length > 0)
    visits.addActionItems(visit.id, extraction.actionItems);

  const target =
    [company ? `🏢 ${company.name}` : "", project ? `📁 ${project.code}` : ""]
      .filter(Boolean)
      .join("  ") || "sin vincular";
  const actionsList = extraction.actionItems.length
    ? "\n\n📋 Accionables:\n" +
      extraction.actionItems.map((a) => `• ${a}`).join("\n")
    : "";

  const reply =
    `✅ Bitácora registrada (#${visit.id}).\n${target}\n\n` +
    `📝 ${extraction.summary || "Sin resumen."}` +
    actionsList +
    `\n\nAbre la app para convertir los accionables en tareas.`;

  return { handled: true, reply };
}
