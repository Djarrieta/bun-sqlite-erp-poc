import {
  escapeHtml,
  layout,
  page,
  pageHeader,
  card,
  button,
  textField,
  formActions,
  alert,
  APP_NAME,
  APP_TAG,
} from "../../components/index.ts";
import type { User } from "./auth.db.ts";

const AUTH_STYLES = `
  .auth-wrap { min-height: 100vh; display: grid; place-items: center; padding: var(--space-6) var(--space-4); }
  .auth { width: 100%; max-width: 390px; display: flex; flex-direction: column; gap: var(--space-4); }
  .auth__brand { display: flex; align-items: center; justify-content: center; gap: var(--space-2); }
  .auth__mark { display: inline-flex; align-items: center; justify-content: center; width: 2.1rem; height: 2.1rem; border-radius: var(--radius); background: var(--accent); color: var(--on-accent); box-shadow: var(--shadow-sm); }
  .auth__wordmark { font-weight: var(--font-weight-bold); font-size: var(--font-size-lg); }
  .auth__wordmark span { font-family: var(--font-mono); font-size: var(--font-size-2xs); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; color: var(--text-muted); margin-left: var(--space-1); }
  .auth-card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); box-shadow: var(--shadow-md); padding: var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
  .auth-card__title { margin: 0; font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); }
  .auth-card__sub { margin: var(--space-1) 0 var(--space-2); color: var(--text-muted); font-size: var(--font-size-sm); }
  .auth-form { display: flex; flex-direction: column; gap: var(--space-3); }
  .alt { text-align: center; margin: 0; font-size: var(--font-size-sm); color: var(--text-muted); }
  .reset-link { margin-top: var(--space-2); padding: var(--space-3); border: 1px dashed var(--border-strong); border-radius: var(--radius); font-size: var(--font-size-xs); word-break: break-all; background: var(--surface-sunken); }
  .reset-link a { font-weight: var(--font-weight-medium); }`;

/** Shared centered auth shell: brand lockup + a surface card + optional footer. */
function authShell(opts: {
  title: string;
  sub?: string;
  body: string;
  footer?: string;
}): string {
  return `
  <div class="auth-wrap">
    <div class="auth">
      <div class="auth__brand">
        <span class="auth__mark" aria-hidden="true">◧</span>
        <span class="auth__wordmark">${APP_NAME}<span>${APP_TAG}</span></span>
      </div>
      <div class="auth-card">
        <div>
          <h1 class="auth-card__title">${opts.title}</h1>
          ${opts.sub ? `<p class="auth-card__sub">${opts.sub}</p>` : ""}
        </div>
        ${opts.body}
      </div>
      ${opts.footer ?? ""}
    </div>
  </div>`;
}

/** Login or register page. */
export function authPage(
  mode: "login" | "register",
  opts: { error?: string; email?: string; notice?: string } = {}
): string {
  const isLogin = mode === "login";
  const title = isLogin ? "Iniciar sesión" : "Crear cuenta";
  const sub = isLogin
    ? "Accede a tu panel de control."
    : "Crea una cuenta para empezar.";
  const action = isLogin ? "/login" : "/register";
  const submitLabel = isLogin ? "Entrar" : "Registrarme";
  const altText = isLogin
    ? `¿No tienes cuenta? <a href="/register">Regístrate</a>`
    : `¿Ya tienes cuenta? <a href="/login">Inicia sesión</a>`;

  const inner = `
    ${alert(opts.notice ?? "", "success")}
    ${alert(opts.error ?? "", "error")}
    <form class="auth-form" method="POST" action="${action}">
      <input type="email" name="email" placeholder="tu@correo.com"
        value="${escapeHtml(opts.email ?? "")}" autocomplete="email" required />
      <input type="password" name="password" placeholder="Contraseña"
        autocomplete="${isLogin ? "current-password" : "new-password"}"
        minlength="8" required />
      ${button({ label: submitLabel, block: true })}
    </form>
    ${isLogin ? `<p class="alt"><a href="/forgot">¿Olvidaste tu contraseña?</a></p>` : ""}`;

  return layout({
    title: `${title} · App`,
    maxWidth: "none",
    margin: "0",
    pageStyles: AUTH_STYLES,
    body: authShell({
      title,
      sub,
      body: inner,
      footer: `<p class="alt">${altText}</p>`,
    }),
  });
}

/** Forgot-password page: request a reset link (and, in dev, reveal it). */
export function forgotPasswordPage(
  opts: { sent?: boolean; email?: string; resetUrl?: string; error?: string } = {}
): string {
  const inner = opts.sent
    ? `${alert(
        "Si el correo existe, generamos un enlace para restablecer la contraseña.",
        "success"
      )}${
        opts.resetUrl
          ? `<div class="reset-link">Enlace de desarrollo:<br /><a href="${opts.resetUrl}">${escapeHtml(
              opts.resetUrl
            )}</a></div>`
          : ""
      }`
    : `${alert(opts.error ?? "", "error")}
    <form class="auth-form" method="POST" action="/forgot">
      <input type="email" name="email" placeholder="tu@correo.com"
        value="${escapeHtml(opts.email ?? "")}" autocomplete="email" required />
      ${button({ label: "Enviar enlace", block: true })}
    </form>`;

  return layout({
    title: "Restablecer contraseña · App",
    maxWidth: "none",
    margin: "0",
    pageStyles: AUTH_STYLES,
    body: authShell({
      title: "Restablecer contraseña",
      sub: "Te enviaremos un enlace para crear una nueva.",
      body: inner,
      footer: `<p class="alt"><a href="/login">Volver a iniciar sesión</a></p>`,
    }),
  });
}

/** Reset-password page: choose a new password using a one-time token. */
export function resetPasswordPage(opts: {
  token: string;
  error?: string;
}): string {
  const inner = `
    ${alert(opts.error ?? "", "error")}
    <form class="auth-form" method="POST" action="/reset">
      <input type="hidden" name="token" value="${escapeHtml(opts.token)}" />
      <input type="password" name="password" placeholder="Nueva contraseña"
        autocomplete="new-password" minlength="8" required />
      <input type="password" name="confirm" placeholder="Repite la contraseña"
        autocomplete="new-password" minlength="8" required />
      ${button({ label: "Guardar contraseña", block: true })}
    </form>`;

  return layout({
    title: "Nueva contraseña · App",
    maxWidth: "none",
    margin: "0",
    pageStyles: AUTH_STYLES,
    body: authShell({
      title: "Nueva contraseña",
      sub: "Elige una contraseña segura.",
      body: inner,
    }),
  });
}

/** Account page for the logged-in user to change their own password. */
export function accountPage(
  user: User,
  opts: { error?: string; success?: boolean } = {}
): string {
  const formBody = `
    ${opts.success ? alert("Tu contraseña fue actualizada.", "success") : ""}
    ${alert(opts.error ?? "", "error")}
    ${textField({
      name: "current",
      label: "Contraseña actual",
      type: "password",
      required: true,
      autocomplete: "current-password",
    })}
    ${textField({
      name: "next",
      label: "Nueva contraseña",
      type: "password",
      required: true,
      autocomplete: "new-password",
      attrs: 'minlength="8"',
    })}
    ${textField({
      name: "confirm",
      label: "Repite la nueva contraseña",
      type: "password",
      required: true,
      autocomplete: "new-password",
      attrs: 'minlength="8"',
    })}
    ${formActions(button({ label: "Cambiar contraseña" }))}`;

  const logout = `<form method="POST" action="/logout">${button({
    label: "Cerrar sesión",
    variant: "secondary",
  })}</form>`;

  const body = `
  ${pageHeader("Mi cuenta", {
    eyebrow: "Cuenta",
    subtitle: `${escapeHtml(user.email)} · ${escapeHtml(user.role)}`,
    actions: logout,
  })}
  ${card(formBody, {
    as: "form",
    attrs: 'method="POST" action="/account/password"',
  })}`;

  return page({
    user,
    current: "/account",
    title: "Mi cuenta · App",
    body,
    maxWidth: "520px",
  });
}
