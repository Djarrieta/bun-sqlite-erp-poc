import { html, notFound, redirect } from "./core/http.ts";
import { Router } from "./core/router.ts";
import { registerModule } from "./core/modules.ts";
import {
  authService,
  handlePublicAuth,
  registerAccountRoutes,
} from "./auth/index.ts";
import { homePage } from "./views.ts";
import { itemsModule } from "./modules/items/index.ts";
import { locationsModule } from "./modules/locations/index.ts";
import { inventoryModule } from "./modules/inventory/index.ts";
import { movementsModule } from "./modules/movements/index.ts";
import { eventsModule } from "./modules/events/index.ts";
import { usersModule } from "./modules/users/index.ts";

const PORT = Number(process.env.PORT ?? 4000);

// Every feature registers as a module on the shared router. Add new modules
// here. Auth is NOT a module (see `src/auth`): its authenticated `/account`
// routes are mounted directly via `registerAccountRoutes`, and its public
// login/logout routes run before the guard via `handlePublicAuth`.
const router = new Router();
registerModule(router, itemsModule);
registerModule(router, locationsModule);
registerModule(router, inventoryModule);
registerModule(router, movementsModule);
registerModule(router, eventsModule);
registerModule(router, usersModule);
registerAccountRoutes(router);

// There is no public sign-up: seed the first admin if the database is empty.
await authService.ensureAdmin();

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;

    // --- Static assets: self-hosted fonts ------------------------------
    // Public and served before the auth guard so the login page is styled
    // too. The strict filename check blocks path traversal.
    if (req.method === "GET" && pathname.startsWith("/fonts/")) {
      const name = pathname.slice("/fonts/".length);
      if (/^[a-z0-9-]+\.woff2$/.test(name)) {
        const file = Bun.file(`public/fonts/${name}`);
        if (await file.exists()) {
          return new Response(file, {
            headers: {
              "content-type": "font/woff2",
              "cache-control": "public, max-age=31536000, immutable",
            },
          });
        }
      }
      return notFound();
    }

    const user = authService.getUserFromRequest(req);

    // --- Public auth routes (login/logout/forgot/reset) ----------------
    const authResponse = await handlePublicAuth(req, url, user);
    if (authResponse) return authResponse;

    // --- Auth guard: everything below requires a session ----------------
    if (!user) return redirect("/login");

    // Dashboard
    if (req.method === "GET" && pathname === "/") return html(homePage(user));

    // --- Feature modules + account -------------------------------------
    const matched = router.match(req.method, pathname);
    if (matched) {
      return matched.handler({ req, url, params: matched.params, user });
    }

    return notFound();
  },
});

console.log(`🚀 App running at http://localhost:${server.port}`);
