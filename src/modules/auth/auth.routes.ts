import { html, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { authService } from "./auth.service.ts";
import { accountPage, loginPage } from "./auth.views.ts";
import type { User } from "./auth.db.ts";

/**
 * Handle public (unauthenticated) auth routes: login and logout. Returns a
 * Response when the request matches one of these routes, otherwise null so the
 * caller can continue dispatching.
 *
 * There is NO public registration and NO self-service password reset: accounts
 * are created only by an admin (see the users module), and a forgotten password
 * is reset by an admin assigning a temporary one. The very first admin is
 * seeded at startup by `authService.ensureAdmin()` in `src/index.ts`.
 *
 * DIVERGENCE FROM THE MODULE PATTERN: normal modules register every route on the
 * shared `Router` inside `register()`, which runs AFTER the auth guard. These
 * routes must be reachable WITHOUT a session, so they are dispatched directly in
 * `src/index.ts` before the guard instead of going through the router.
 */
export async function handlePublicAuth(
  req: Request,
  url: URL,
  user: User | null
): Promise<Response | null> {
  const { pathname } = url;

  if (pathname === "/login") {
    if (user) return redirect("/");
    if (req.method === "GET") return html(loginPage());
    if (req.method === "POST") {
      const form = await req.formData();
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const result = await authService.login(email, password);
      if (!result.ok || !result.user)
        return html(loginPage({ error: result.error, email }), 401);
      const sid = authService.createSession(result.user.id);
      return redirect("/", { "Set-Cookie": authService.sessionCookie(sid) });
    }
  }

  if (pathname === "/logout" && req.method === "POST") {
    const sid = authService.getSessionId(req);
    if (sid) authService.destroySession(sid);
    return redirect("/login", {
      "Set-Cookie": authService.clearSessionCookie(),
    });
  }

  return null;
}

/**
 * Register self-service account routes on the main (authenticated) router. Any
 * logged-in user may change their own password here, independent of module
 * permissions. Called from the module's `register()` (see `index.ts`).
 */
export function registerAccountRoutes(router: Router): void {
  router.get("/account", ({ user }: RouteContext) => html(accountPage(user)));

  router.post("/account/password", async ({ req, user }: RouteContext) => {
    const form = await req.formData();
    const current = String(form.get("current") ?? "");
    const next = String(form.get("next") ?? "");
    const confirm = String(form.get("confirm") ?? "");
    if (next !== confirm)
      return html(
        accountPage(user, { error: "Las contraseñas no coinciden." }),
        400
      );
    const result = await authService.changePassword(user.id, current, next);
    if (!result.ok)
      return html(accountPage(user, { error: result.error }), 400);
    return html(accountPage(user, { success: true }));
  });
}
