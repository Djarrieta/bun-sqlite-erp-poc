import { escapeHtml, layout, HTMX_SCRIPT } from "../../components/layout.ts";
import { nav } from "../../components/nav.ts";
import type { User } from "./auth.db.ts";

const AUTH_STYLES = `
  form.auth { display: flex; flex-direction: column; gap: 0.75rem; }
  .alt { text-align: center; margin-top: 1.25rem; font-size: var(--font-size-sm); opacity: 0.85; }
  .notice, .error {
    padding: 0.6rem 0.8rem;
    border-radius: var(--radius);
    font-size: var(--font-size-sm);
    margin: 0 0 0.5rem;
  }
  .error {
    background: color-mix(in srgb, var(--danger) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--danger) 33%, transparent);
    color: var(--danger);
  }
  .notice {
    background: color-mix(in srgb, var(--success) 13%, transparent);
    border: 1px solid color-mix(in srgb, var(--success) 33%, transparent);
    color: var(--success-text);
  }
  .reset-link {
    margin-top: 1rem;
    padding: 0.75rem;
    border: 1px dashed var(--border-strong);
    border-radius: var(--radius);
    font-size: var(--font-size-xs);
    word-break: break-all;
  }
  .reset-link a { font-weight: var(--font-weight-medium); }
  .muted { opacity: 0.7; font-size: var(--font-size-sm); text-align: center; }`;

function errorHtml(error?: string): string {
  return error ? `<p class="error">${escapeHtml(error)}</p>` : "";
}

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
  const notice = opts.notice
    ? `<p class="notice">${escapeHtml(opts.notice)}</p>`
    : "";
  const forgot = isLogin
    ? `<p class="alt"><a href="/forgot">¿Olvidaste tu contraseña?</a></p>`
    : "";

  const body = `
  <h1>📝 ${title}</h1>
  ${notice}
  ${errorHtml(opts.error)}
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
    <button class="primary" type="submit">${submitLabel}</button>
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
    ? `<p class="notice">Si el correo existe, generamos un enlace para restablecer la contraseña.</p>${
        opts.resetUrl
          ? `<div class="reset-link">Enlace de desarrollo:<br /><a href="${opts.resetUrl}">${escapeHtml(
              opts.resetUrl
            )}</a></div>`
          : ""
      }<p class="alt"><a href="/login">Volver a iniciar sesión</a></p>`
    : `<form class="auth" method="POST" action="/forgot">
    <input type="email" name="email" placeholder="tu@correo.com"
      value="${escapeHtml(opts.email ?? "")}" autocomplete="email" required />
    <button class="primary" type="submit">Enviar enlace</button>
  </form>
  <p class="alt"><a href="/login">Volver a iniciar sesión</a></p>`;

  const body = `
  <h1>🔑 Restablecer contraseña</h1>
  ${errorHtml(opts.error)}
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
  ${errorHtml(opts.error)}
  <form class="auth" method="POST" action="/reset">
    <input type="hidden" name="token" value="${escapeHtml(opts.token)}" />
    <input type="password" name="password" placeholder="Nueva contraseña"
      autocomplete="new-password" minlength="8" required />
    <input type="password" name="confirm" placeholder="Repite la contraseña"
      autocomplete="new-password" minlength="8" required />
    <button class="primary" type="submit">Guardar contraseña</button>
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
  const success = opts.success
    ? `<p class="notice">Tu contraseña fue actualizada.</p>`
    : "";

  const body = `
  ${nav(user, "/account")}
  <h1>👤 Mi cuenta</h1>
  <p class="muted">${escapeHtml(user.email)} · ${escapeHtml(user.role)}</p>
  ${success}
  ${errorHtml(opts.error)}
  <form class="auth" method="POST" action="/account/password">
    <input type="password" name="current" placeholder="Contraseña actual"
      autocomplete="current-password" required />
    <input type="password" name="next" placeholder="Nueva contraseña"
      autocomplete="new-password" minlength="8" required />
    <input type="password" name="confirm" placeholder="Repite la nueva contraseña"
      autocomplete="new-password" minlength="8" required />
    <button class="primary" type="submit">Cambiar contraseña</button>
  </form>`;

  return layout({
    title: "Mi cuenta · App",
    maxWidth: "420px",
    margin: "2.5rem",
    head: HTMX_SCRIPT,
    pageStyles: AUTH_STYLES,
    body,
  });
}
