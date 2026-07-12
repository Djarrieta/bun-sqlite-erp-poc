import { escapeHtml, layout } from "../../components/layout.ts";
import { page } from "../../components/page.ts";
import { button } from "../../components/button.ts";
import { alert } from "../../components/feedback.ts";
import type { User } from "./auth.db.ts";

const AUTH_STYLES = `
  form.auth { display: flex; flex-direction: column; gap: var(--space-3); }
  .alt { text-align: center; margin-top: var(--space-5); font-size: var(--font-size-sm); opacity: 0.85; }
  .reset-link {
    margin-top: var(--space-4);
    padding: var(--space-3);
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    font-size: var(--font-size-xs);
    word-break: break-all;
  }
  .reset-link a { font-weight: var(--font-weight-medium); }`;

/** Login or register page. */
export function authPage(
  mode: "login" | "register",
  opts: { error?: string; email?: string; notice?: string } = {}
): string {
  const isLogin = mode === "login";
  const title = isLogin ? "Iniciar sesión" : "Crear cuenta";
  const action = isLogin ? "/login" : "/register";
  const submitLabel = isLogin ? "Entrar" : "Registrarme";
  const altText = isLogin
    ? `¿No tienes cuenta? <a href="/register">Regístrate</a>`
    : `¿Ya tienes cuenta? <a href="/login">Inicia sesión</a>`;
  const forgot = isLogin
    ? `<p class="alt"><a href="/forgot">¿Olvidaste tu contraseña?</a></p>`
    : "";

  const body = `
  <h1>📝 ${title}</h1>
  ${alert(opts.notice ?? "", "success")}
  ${alert(opts.error ?? "", "error")}
  <form class="auth" method="POST" action="${action}">
    <input
      type="email"
      name="email"
      placeholder="tu@correo.com"
      value="${escapeHtml(opts.email ?? "")}"
      autocomplete="email"
      required />
    <input
      type="password"
      name="password"
      placeholder="Contraseña"
      autocomplete="${isLogin ? "current-password" : "new-password"}"
      minlength="8"
      required />
    ${button({ label: submitLabel, block: true })}
  </form>
  ${forgot}
  <p class="alt">${altText}</p>`;

  return layout({
    title: `${title} · App`,
    maxWidth: "380px",
    margin: "4rem",
    pageStyles: AUTH_STYLES,
    body,
  });
}

/** Forgot-password page: request a reset link (and, in dev, reveal it). */
export function forgotPasswordPage(
  opts: { sent?: boolean; email?: string; resetUrl?: string; error?: string } = {}
): string {
  const sentBlock = opts.sent
    ? `${alert(
        "Si el correo existe, generamos un enlace para restablecer la contraseña.",
        "success"
      )}${
        opts.resetUrl
          ? `<div class="reset-link">Enlace de desarrollo:<br /><a href="${opts.resetUrl}">${escapeHtml(
              opts.resetUrl
            )}</a></div>`
          : ""
      }<p class="alt"><a href="/login">Volver a iniciar sesión</a></p>`
    : `<form class="auth" method="POST" action="/forgot">
    <input type="email" name="email" placeholder="tu@correo.com"
      value="${escapeHtml(opts.email ?? "")}" autocomplete="email" required />
    ${button({ label: "Enviar enlace", block: true })}
  </form>
  <p class="alt"><a href="/login">Volver a iniciar sesión</a></p>`;

  const body = `
  <h1>🔑 Restablecer contraseña</h1>
  ${alert(opts.error ?? "", "error")}
  ${sentBlock}`;

  return layout({
    title: "Restablecer contraseña · App",
    maxWidth: "380px",
    margin: "4rem",
    pageStyles: AUTH_STYLES,
    body,
  });
}

/** Reset-password page: choose a new password using a one-time token. */
export function resetPasswordPage(opts: {
  token: string;
  error?: string;
}): string {
  const body = `
  <h1>🔑 Nueva contraseña</h1>
  ${alert(opts.error ?? "", "error")}
  <form class="auth" method="POST" action="/reset">
    <input type="hidden" name="token" value="${escapeHtml(opts.token)}" />
    <input type="password" name="password" placeholder="Nueva contraseña"
      autocomplete="new-password" minlength="8" required />
    <input type="password" name="confirm" placeholder="Repite la contraseña"
      autocomplete="new-password" minlength="8" required />
    ${button({ label: "Guardar contraseña", block: true })}
  </form>`;

  return layout({
    title: "Nueva contraseña · App",
    maxWidth: "380px",
    margin: "4rem",
    pageStyles: AUTH_STYLES,
    body,
  });
}

/** Account page for the logged-in user to change their own password. */
export function accountPage(
  user: User,
  opts: { error?: string; success?: boolean } = {}
): string {
  const body = `
  <h1>👤 Mi cuenta</h1>
  <p class="muted" style="text-align:center">${escapeHtml(
    user.email
  )} · ${escapeHtml(user.role)}</p>
  ${opts.success ? alert("Tu contraseña fue actualizada.", "success") : ""}
  ${alert(opts.error ?? "", "error")}
  <form class="auth" method="POST" action="/account/password">
    <input type="password" name="current" placeholder="Contraseña actual"
      autocomplete="current-password" required />
    <input type="password" name="next" placeholder="Nueva contraseña"
      autocomplete="new-password" minlength="8" required />
    <input type="password" name="confirm" placeholder="Repite la nueva contraseña"
      autocomplete="new-password" minlength="8" required />
    ${button({ label: "Cambiar contraseña", block: true })}
  </form>`;

  return page({
    user,
    current: "/account",
    title: "Mi cuenta · App",
    body,
    maxWidth: "420px",
    pageStyles: AUTH_STYLES,
  });
}
