/**
 * The agent: turns a user's Telegram message into a reply, driving DeepSeek's
 * tool-calling loop against the role-filtered tool set. Mirrors the store's
 * manual loop, with one addition — a mutating tool call never executes
 * directly; instead it produces a preview and pauses for an explicit "sí"/"no".
 */
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  type BaseMessage,
} from "@langchain/core/messages";
import { can } from "../core/permissions.ts";
import type { User } from "../auth/auth.db.ts";
import { deepseek } from "../core/llm.ts";
import { buildSystemPrompt } from "./prompt.ts";
import { TOOLS_BY_NAME, toolSpecsFor } from "./tools.ts";
import { clearPending, remember, type ChatSession } from "./session.ts";

/** Hard cap on LLM round-trips per message, so a loop can't run away. */
const MAX_STEPS = 8;

// Unicode-aware boundary `(?![\p{L}\p{N}])` instead of `\b`: `\b` treats the
// accented "í" as a non-word char, so a plain "sí" (the natural confirmation)
// would never match and the bot re-asked forever.
const YES = /^(s[ií]|si|yes|y|ok|okay|dale|confirmo|confirmar|adelante|hazlo|correcto|claro|listo)(?![\p{L}\p{N}])/iu;
const NO = /^(no|n|cancela|cancelar|nel|para|detente|mejor no|olvida)(?![\p{L}\p{N}])/iu;

const factory = {
  human: (t: string): BaseMessage => new HumanMessage(t),
  ai: (t: string): BaseMessage => new AIMessage(t),
};

/** LangChain message content can be a string or an array of blocks. */
function contentToString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((c) =>
        typeof c === "string" ? c : ((c as { text?: string }).text ?? "")
      )
      .join("");
  return String(content ?? "");
}

/** Entry point: reply to one text message, updating the session in place. */
export async function handleMessage(
  user: User,
  session: ChatSession,
  text: string
): Promise<string> {
  if (session.pending) return resolvePending(user, session, text);
  return runLoop(user, session, text);
}

/** Interpret a "sí"/"no" reply to a mutation that is awaiting confirmation. */
function resolvePending(user: User, session: ChatSession, text: string): string {
  const pending = session.pending!;
  const answer = text.trim();

  if (YES.test(answer)) {
    clearPending(session);
    const tool = TOOLS_BY_NAME.get(pending.tool);
    let result: string;
    if (!tool || !can(user, tool.module, tool.action)) {
      result = "Ya no tienes permiso para esa acción.";
    } else {
      try {
        result = tool.run(pending.args, user, false);
      } catch (e) {
        result = `No se pudo completar: ${(e as Error).message}`;
      }
    }
    remember(session, text, result, factory);
    return result;
  }

  if (NO.test(answer)) {
    clearPending(session);
    const msg = "Operación cancelada.";
    remember(session, text, msg, factory);
    return msg;
  }

  // Ambiguous reply: keep the pending action and re-ask.
  return `Tienes una operación pendiente de confirmación:\n\n${pending.preview}\n\nResponde "sí" para confirmar o "no" para cancelar.`;
}

/** Run the DeepSeek tool-calling loop until a final answer or a confirmation. */
async function runLoop(
  user: User,
  session: ChatSession,
  text: string
): Promise<string> {
  const llm = deepseek().bindTools(toolSpecsFor(user));
  const messages: BaseMessage[] = [
    new SystemMessage(buildSystemPrompt(user)),
    ...session.history,
    new HumanMessage(text),
  ];

  for (let step = 0; step < MAX_STEPS; step++) {
    const ai = await llm.invoke(messages);
    messages.push(ai);

    const toolCalls = ai.tool_calls ?? [];
    if (toolCalls.length === 0) {
      const reply = contentToString(ai.content).trim() || "Listo.";
      remember(session, text, reply, factory);
      return reply;
    }

    for (const call of toolCalls) {
      const callId = call.id ?? call.name;
      const tool = TOOLS_BY_NAME.get(call.name);
      const args = (call.args ?? {}) as Record<string, unknown>;

      if (!tool || !can(user, tool.module, tool.action)) {
        messages.push(
          new ToolMessage({
            content: JSON.stringify({
              error: "Herramienta no disponible para tu rol.",
            }),
            tool_call_id: callId,
          })
        );
        continue;
      }

      if (tool.mutating) {
        // Do NOT write. Validate + build a preview; on validation error, feed it
        // back so the model can correct or ask the user for missing fields.
        let preview: string;
        try {
          preview = tool.run(args, user, true);
        } catch (e) {
          messages.push(
            new ToolMessage({
              content: JSON.stringify({ error: (e as Error).message }),
              tool_call_id: callId,
            })
          );
          continue;
        }
        // Stash the pending mutation and pause for confirmation. History keeps
        // only distilled text so the next turn has no dangling tool call.
        session.pending = { tool: call.name, args, preview };
        const reply = `${preview}\n\n¿Confirmas? Responde "sí" o "no".`;
        remember(session, text, reply, factory);
        return reply;
      }

      // Read tool: execute now and feed the result back to the model.
      try {
        messages.push(
          new ToolMessage({
            content: tool.run(args, user, false),
            tool_call_id: callId,
          })
        );
      } catch (e) {
        messages.push(
          new ToolMessage({
            content: JSON.stringify({ error: (e as Error).message }),
            tool_call_id: callId,
          })
        );
      }
    }
  }

  const reply =
    "No pude completar la solicitud (demasiados pasos). Intenta reformularla.";
  remember(session, text, reply, factory);
  return reply;
}
