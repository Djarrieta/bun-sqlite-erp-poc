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
} from "../components/index.ts";
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
  .alt { text-align: center; margin: 0; font-size: var(--font-size-sm); color: var(--text-muted); }`;

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

/**
 * Login page. There is no public sign-up: accounts are created by an admin in
 * the users module, so this page only authenticates existing users.
 */
export function loginPage(
  opts: { error?: string; email?: string; notice?: string } = {}
): string {
  const inner = `
    ${alert(opts.notice ?? "", "success")}
    ${alert(opts.error ?? "", "error")}
    <form class="auth-form" method="POST" action="/login">
      <input type="email" name="email" placeholder="tu@correo.com"
        value="${escapeHtml(opts.email ?? "")}" autocomplete="email" required />
      <input type="password" name="password" placeholder="Contraseña"
        autocomplete="current-password" minlength="8" required />
      ${button({ label: "Entrar", block: true })}
    </form>`;

  return layout({
    title: "Iniciar sesión · App",
    maxWidth: "none",
    margin: "0",
    pageStyles: AUTH_STYLES,
    body: authShell({
      title: "Iniciar sesión",
      sub: "Accede a tu panel de control.",
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
