/**
 * Telegram bot entrypoint (separate process from the web server, long polling).
 *
 * It registers the same modules as the web app on a throwaway Router so the
 * permission registry is populated and every module's table-creating side
 * effect runs, then resolves each Telegram sender to an app user via the
 * admin-assigned `telegram_id` and hands the message to the agent.
 *
 * Run with: `bun run bot`  (needs TELEGRAM_BOT_TOKEN and DEEPSEEK_API_KEY).
 */
import { Bot } from "grammy";
import { Router } from "../core/router.ts";
import { registerModule } from "../core/modules.ts";
import { authService } from "../auth/auth.service.ts";
import { itemsModule } from "../modules/items/index.ts";
import { locationsModule } from "../modules/locations/index.ts";
import { inventoryModule } from "../modules/inventory/index.ts";
import { movementsModule } from "../modules/movements/index.ts";
import { companiesModule } from "../modules/companies/index.ts";
import { contactsModule } from "../modules/contacts/index.ts";
import { projectsModule } from "../modules/projects/index.ts";
import { visitsModule } from "../modules/visits/index.ts";
import { tasksModule } from "../modules/tasks/index.ts";
import { eventsModule } from "../modules/events/index.ts";
import { usersModule } from "../modules/users/index.ts";
import { reportsModule } from "../modules/reports/index.ts";
import { UserRepository } from "../auth/auth.db.ts";
import { getSession } from "./session.ts";
import { handleMessage } from "./agent.ts";
import { WhisperTranscriber } from "./transcriber.ts";
import { tryLogVisit } from "./visit.ts";

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// Same wiring as src/index.ts: registering the modules calls each `register()`
// (which populates the permission registry) and pulls in the `*.db.ts` side
// effects that CREATE the tables. The bot serves no HTTP, so the Router is a
// throwaway used only to satisfy `registerModule`. Auth is not a module; its
// tables are created by importing `authService`/`UserRepository` above.
const router = new Router();
registerModule(router, itemsModule);
registerModule(router, locationsModule);
registerModule(router, inventoryModule);
registerModule(router, movementsModule);
registerModule(router, companiesModule);
registerModule(router, contactsModule);
registerModule(router, projectsModule);
registerModule(router, visitsModule);
registerModule(router, tasksModule);
registerModule(router, eventsModule);
registerModule(router, usersModule);
registerModule(router, reportsModule);
await authService.ensureAdmin();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error(
    "❌ TELEGRAM_BOT_TOKEN no está definido. Añádelo a tu entorno (.env) y reintenta."
  );
  process.exit(1);
}
if (!process.env.DEEPSEEK_API_KEY) {
  console.error(
    "❌ DEEPSEEK_API_KEY no está definido. Añádelo a tu entorno (.env) y reintenta."
  );
  process.exit(1);
}

const users = new UserRepository();
const bot = new Bot(token);

const transcriber = process.env.WHISPER_URL
  ? new WhisperTranscriber(process.env.WHISPER_URL)
  : null;

async function downloadFile(fileId: string): Promise<Buffer> {
  const file = await bot.api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
  const res = await fetch(url);
  return Buffer.from(await res.arrayBuffer());
}

const HELP = `Soy el asistente del ERP. Escríbeme en lenguaje natural para consultar o modificar datos según tu rol.

Ejemplos:
• "lista los artículos activos"
• "¿qué inventario hay en la ubicación WH-01?"
• "crea una ubicación WH-02 llamada Bodega Norte"

Las acciones que modifican datos te pedirán confirmación (responde "sí" o "no").`;

bot.command("start", (ctx) =>
  ctx.reply(
    `Hola. ${HELP}\n\nSi el bot no te reconoce, pide a un administrador que vincule tu ID de Telegram a tu cuenta.`
  )
);
bot.command("help", (ctx) => ctx.reply(HELP));

bot.on("message:voice", async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;
  if (!transcriber) {
    await ctx.reply("❌ Transcripción de audio no configurada.");
    return;
  }

  const user = users.findByTelegramId(String(fromId));
  if (!user) {
    await ctx.reply(
      `No estás vinculado a ninguna cuenta. Pide a un administrador que registre tu ID de Telegram (${fromId}) en el módulo de Usuarios.`
    );
    return;
  }

  try {
    await ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});
    await ctx.reply("🎤 Transcribiendo...");

    const buffer = await downloadFile(ctx.message.voice.file_id);
    const text = await transcriber.transcribe(buffer, ctx.message.voice.mime_type);

    if (!text) {
      await ctx.reply("⚠️ No se pudo transcribir el audio.");
      return;
    }

    await ctx.reply(`📝 <b>Transcripción:</b> ${escapeHtml(text)}`, { parse_mode: "HTML" });

    // Audio may be a visit log (bitácora). If so, handle it here; otherwise
    // fall back to the normal agent (query) flow.
    const visitResult = await tryLogVisit(user, text, {
      buffer,
      mimeType: ctx.message.voice.mime_type,
    });
    if (visitResult.handled) {
      await ctx.reply(visitResult.reply ?? "Listo.");
      return;
    }

    const session = getSession(ctx.chat.id);
    const reply = await handleMessage(user, session, text);
    await ctx.reply(reply);
  } catch (err) {
    console.error("[bot] voice error:", err);
    await ctx.reply("Ocurrió un error procesando el audio. Intenta de nuevo.");
  }
});

bot.on("message:audio", async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;
  if (!transcriber) {
    await ctx.reply("❌ Transcripción de audio no configurada.");
    return;
  }

  const user = users.findByTelegramId(String(fromId));
  if (!user) {
    await ctx.reply(
      `No estás vinculado a ninguna cuenta. Pide a un administrador que registre tu ID de Telegram (${fromId}) en el módulo de Usuarios.`
    );
    return;
  }

  try {
    await ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});
    await ctx.reply("🎤 Transcribiendo...");

    const buffer = await downloadFile(ctx.message.audio.file_id);
    const mimeType = ctx.message.audio.mime_type ?? "audio/ogg";
    const text = await transcriber.transcribe(buffer, mimeType);

    if (!text) {
      await ctx.reply("⚠️ No se pudo transcribir el audio.");
      return;
    }

    await ctx.reply(`📝 <b>Transcripción:</b> ${escapeHtml(text)}`, { parse_mode: "HTML" });

    // Audio may be a visit log (bitácora). If so, handle it here; otherwise
    // fall back to the normal agent (query) flow.
    const visitResult = await tryLogVisit(user, text, { buffer, mimeType });
    if (visitResult.handled) {
      await ctx.reply(visitResult.reply ?? "Listo.");
      return;
    }

    const session = getSession(ctx.chat.id);
    const reply = await handleMessage(user, session, text);
    await ctx.reply(reply);
  } catch (err) {
    console.error("[bot] audio error:", err);
    await ctx.reply("Ocurrió un error procesando el audio. Intenta de nuevo.");
  }
});

bot.on("message:text", async (ctx) => {
  const fromId = ctx.from?.id;
  if (!fromId) return;

  const text = ctx.message.text.trim().slice(0, 2000);
  if (!text || text.startsWith("/")) return; // commands handled above

  const user = users.findByTelegramId(String(fromId));
  if (!user) {
    await ctx.reply(
      `No estás vinculado a ninguna cuenta. Pide a un administrador que registre tu ID de Telegram (${fromId}) en el módulo de Usuarios.`
    );
    return;
  }

  const session = getSession(ctx.chat.id);
  try {
    // Best-effort "typing…" indicator; ignore if unsupported.
    await ctx.api.sendChatAction(ctx.chat.id, "typing").catch(() => {});
    const reply = await handleMessage(user, session, text);
    await ctx.reply(reply);
  } catch (err) {
    console.error("[bot] handleMessage error:", err);
    await ctx.reply("Ocurrió un error procesando tu mensaje. Intenta de nuevo.");
  }
});

bot.catch((err) => console.error("[bot] runtime error:", err));

await bot.start({
  onStart: (info) =>
    console.log(`🤖 Bot @${info.username} iniciado (long polling). Ctrl+C para detener.`),
});
