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
import { authService } from "../modules/auth/auth.service.ts";
import { authModule } from "../modules/auth/index.ts";
import { itemsModule } from "../modules/items/index.ts";
import { locationsModule } from "../modules/locations/index.ts";
import { inventoryModule } from "../modules/inventory/index.ts";
import { movementsModule } from "../modules/movements/index.ts";
import { eventsModule } from "../modules/events/index.ts";
import { usersModule } from "../modules/users/index.ts";
import { UserRepository } from "../modules/auth/auth.db.ts";
import { getSession } from "./session.ts";
import { handleMessage } from "./agent.ts";

// Same wiring as src/index.ts: registering the modules calls each `register()`
// (which populates the permission registry) and pulls in the `*.db.ts` side
// effects that CREATE the tables. The bot serves no HTTP, so the Router is a
// throwaway used only to satisfy `registerModule`.
const router = new Router();
registerModule(router, itemsModule);
registerModule(router, locationsModule);
registerModule(router, inventoryModule);
registerModule(router, movementsModule);
registerModule(router, eventsModule);
registerModule(router, usersModule);
registerModule(router, authModule);
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
