import { html, notFound, redirect } from "./core/http.ts";
import { Router } from "./core/router.ts";
import { registerModule } from "./core/modules.ts";
import { authService } from "./modules/auth/auth.service.ts";
import { authModule, handlePublicAuth } from "./modules/auth/index.ts";
import { homePage } from "./views.ts";
import { itemsModule } from "./modules/items/index.ts";
import { usersModule } from "./modules/users/index.ts";

const PORT = Number(process.env.PORT ?? 4000);

// Every feature registers as a module on the shared router. Auth is a module
// too (self-service /account routes); its public login/register/reset routes
// run before the guard via `handlePublicAuth`. Add new modules here.
const router = new Router();
registerModule(router, itemsModule);
registerModule(router, usersModule);
registerModule(router, authModule);

const server = Bun.serve({
  port: PORT,
  async fetch(req) {
    const url = new URL(req.url);
    const { pathname } = url;
    const user = authService.getUserFromRequest(req);

    // --- Public auth routes (login/register/logout/forgot/reset) --------
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
