import { html, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { authService } from "./auth.service.ts";
import {
  accountPage,
  authPage,
  forgotPasswordPage,
  resetPasswordPage,
} from "./auth.views.ts";
import type { User } from "./auth.db.ts";

const isProd = process.env.NODE_ENV === "production";

/**
 * Handle public (unauthenticated) auth routes: login, register, logout, and the
 * forgot/reset password flow. Returns a Response when the request matches one of
 * these routes, otherwise null so the caller can continue dispatching.
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
    if (req.method === "GET") return html(authPage("login"));
    if (req.method === "POST") {
      const form = await req.formData();
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const result = await authService.login(email, password);
      if (!result.ok || !result.user)
        return html(authPage("login", { error: result.error, email }), 401);
      const sid = authService.createSession(result.user.id);
      return redirect("/", { "Set-Cookie": authService.sessionCookie(sid) });
    }
  }

  if (pathname === "/register") {
    if (user) return redirect("/");
    if (req.method === "GET") return html(authPage("register"));
    if (req.method === "POST") {
      const form = await req.formData();
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      const result = await authService.register(email, password);
      if (!result.ok || !result.user)
        return html(authPage("register", { error: result.error, email }), 400);
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

  if (pathname === "/forgot") {
    if (user) return redirect("/");
    if (req.method === "GET") return html(forgotPasswordPage());
    if (req.method === "POST") {
      const form = await req.formData();
      const email = String(form.get("email") ?? "");
      const { token } = authService.requestPasswordReset(email);
      // Dev convenience: reveal the reset link. In production it is emailed.
      const resetUrl =
        token && !isProd
          ? `${url.origin}/reset?token=${encodeURIComponent(token)}`
          : undefined;
      return html(forgotPasswordPage({ sent: true, email, resetUrl }));
    }
  }

  if (pathname === "/reset") {
    if (req.method === "GET") {
      const token = url.searchParams.get("token") ?? "";
      if (!token)
        return html(
          forgotPasswordPage({
            error: "Enlace inválido. Solicita uno nuevo.",
          })
        );
      return html(resetPasswordPage({ token }));
    }
    if (req.method === "POST") {
      const form = await req.formData();
      const token = String(form.get("token") ?? "");
      const password = String(form.get("password") ?? "");
      const confirm = String(form.get("confirm") ?? "");
      if (password !== confirm)
        return html(
          resetPasswordPage({ token, error: "Las contraseñas no coinciden." }),
          400
        );
      const result = await authService.resetPassword(token, password);
      if (!result.ok)
        return html(resetPasswordPage({ token, error: result.error }), 400);
      return html(
        authPage("login", {
          notice: "Tu contraseña fue actualizada. Inicia sesión.",
        })
      );
    }
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
