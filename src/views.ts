import type { User } from "./modules/auth/auth.db.ts";
import { escapeHtml, page, pageHeader } from "./components/index.ts";
import { getModules } from "./core/modules.ts";
import { can } from "./core/permissions.ts";

const PAGE_STYLES = `
  .tiles { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:var(--space-4); }
  .tile { display:flex; flex-direction:column; gap:var(--space-2); min-height:132px; padding:var(--space-5); background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); text-decoration:none; color:inherit; transition:border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
  .tile:hover { border-color:var(--border-strong); transform:translateY(-2px); box-shadow:var(--shadow-md); }
  .tile__name { font-size:var(--font-size-lg); font-weight:var(--font-weight-semibold); }
  .tile__desc { color:var(--text-muted); font-size:var(--font-size-sm); }
  .tile__go { margin-top:auto; font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--accent-text); }
`;

function tile(href: string, name: string, desc: string, go: string): string {
  return `<a class="tile" href="${href}">
    <span class="tile__name">${escapeHtml(name)}</span>
    <span class="tile__desc">${escapeHtml(desc)}</span>
    <span class="tile__go">${escapeHtml(go)} &rarr;</span>
  </a>`;
}

/** Dashboard shown at "/", linking to the modules the user can access. */
export function homePage(user: User): string {
  const tiles = getModules()
    .filter((m) => can(user, m.name, "view"))
    .map((m) =>
      tile(m.basePath, m.label, `Gestionar ${m.label.toLowerCase()}`, "Abrir")
    );
  tiles.push(tile("/account", "Mi cuenta", "Contraseña y sesión", "Ajustes"));

  const body = `
  ${pageHeader("Inicio", {
    eyebrow: "Panel",
    subtitle: `Conectado como ${escapeHtml(user.email)} · ${escapeHtml(
      user.role
    )}`,
  })}
  <div class="tiles">${tiles.join("")}</div>`;

  return page({
    user,
    current: "/",
    title: "Inicio · App",
    body,
    htmx: false,
    pageStyles: PAGE_STYLES,
  });
}

