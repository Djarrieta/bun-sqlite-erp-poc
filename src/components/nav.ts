import type { User } from "../modules/auth/auth.db.ts";
import { getModules } from "../core/modules.ts";
import { can } from "../core/permissions.ts";
import { escapeHtml } from "./layout.ts";

/** Product wordmark shown in the sidebar and on the auth screens. */
export const APP_NAME = "Núcleo";
export const APP_TAG = "ERP";

/**
 * Sidebar + app-shell styles, aggregated into the global stylesheet by
 * `layout.ts`. The shell only renders on full pages (through `layout()`), so
 * these are always present when the nav is on screen.
 */
export const navStyles = `
    .app-shell { display:grid; grid-template-columns:var(--sidebar-width) minmax(0,1fr); min-height:100vh; }
    .app-main { min-width:0; }
    .app-main__inner { max-width:var(--content-max); margin:0 auto; padding:var(--space-6) var(--space-6) var(--space-8); }

    .sidebar { position:sticky; top:0; align-self:start; height:100vh; display:flex; flex-direction:column; gap:var(--space-5); padding:var(--space-5) var(--space-4); background:var(--surface); border-right:1px solid var(--border); }
    .brand { display:flex; align-items:center; gap:var(--space-3); padding:var(--space-1) var(--space-2); text-decoration:none; color:var(--text); }
    .brand__mark { display:inline-flex; align-items:center; justify-content:center; width:2.1rem; height:2.1rem; border-radius:var(--radius); background:var(--accent); color:var(--on-accent); font-size:1.05rem; box-shadow:var(--shadow-sm); }
    .brand__lockup { display:flex; flex-direction:column; line-height:1.15; }
    .brand__name { font-family:var(--font-display); font-weight:var(--font-weight-bold); letter-spacing:-0.01em; }
    .brand__tag { font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); }

    .sidebar__nav { display:flex; flex-direction:column; gap:2px; flex:1; min-height:0; overflow-y:auto; }
    .sidebar__eyebrow { font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); padding:var(--space-4) var(--space-2) var(--space-1); }
    .navlink { display:flex; align-items:center; gap:var(--space-2); padding:var(--space-2) var(--space-3); border-radius:var(--radius); color:var(--text-muted); text-decoration:none; font-size:var(--font-size-sm); font-weight:var(--font-weight-medium); }
    .navlink:hover { background:var(--surface-sunken); color:var(--text); }
    .navlink.is-active { background:color-mix(in srgb, var(--accent) 12%, transparent); color:var(--accent-text); }

    .sidebar__foot { display:flex; align-items:center; padding-top:var(--space-4); border-top:1px solid var(--border); }
    .account { display:inline-flex; align-items:center; justify-content:center; border-radius:var(--radius-full); text-decoration:none; }
    .account__avatar { display:inline-flex; align-items:center; justify-content:center; flex:0 0 auto; width:2.25rem; height:2.25rem; border-radius:var(--radius-full); background:color-mix(in srgb, var(--accent) 16%, transparent); color:var(--accent-text); font-weight:var(--font-weight-semibold); font-size:var(--font-size-sm); transition:background 0.15s ease, box-shadow 0.15s ease; }
    .account:hover .account__avatar { background:color-mix(in srgb, var(--accent) 24%, transparent); box-shadow:var(--shadow-sm); }

    @media (max-width: 860px) {
      .app-shell { grid-template-columns:1fr; }
      .sidebar { position:static; height:auto; min-width:0; flex-direction:row; align-items:center; flex-wrap:wrap; gap:var(--space-3); border-right:none; border-bottom:1px solid var(--border); }
      .sidebar__nav { flex-direction:row; flex-wrap:nowrap; align-items:center; order:3; flex-basis:100%; min-width:0; overflow-x:auto; gap:var(--space-1); }
      .navlink { flex:0 0 auto; white-space:nowrap; }
      .sidebar__eyebrow { display:none; }
      .sidebar__foot { align-items:center; margin-left:auto; padding-top:0; border-top:none; }
      .app-main__inner { padding:var(--space-5) var(--space-4) var(--space-7); }
    }`;

function navLink(href: string, label: string, currentPath: string): string {
  const active = href === "/" ? currentPath === "/" : currentPath.startsWith(href);
  return `<a class="navlink${active ? " is-active" : ""}" href="${href}"${
    active ? ' aria-current="page"' : ""
  }>${escapeHtml(label)}</a>`;
}

/**
 * The persistent left sidebar shared across authenticated pages: brand, the
 * permission-aware module links, and an account footer. Module links only
 * appear when the current user may view that module, so navigation always
 * reflects each user's business rules. Collapses to a top bar on small screens.
 */
export function nav(user: User, currentPath = ""): string {
  const modules = getModules().filter((m) => can(user, m.name, "view"));
  const moduleLinks = modules
    .map((m) => navLink(m.basePath, m.label, currentPath))
    .join("");
  const initial = escapeHtml((user.email[0] ?? "?").toUpperCase());

  return `
  <aside class="sidebar">
    <a class="brand" href="/">
      <span class="brand__mark" aria-hidden="true">◧</span>
      <span class="brand__lockup">
        <span class="brand__name">${APP_NAME}</span>
        <span class="brand__tag">${APP_TAG}</span>
      </span>
    </a>
    <nav class="sidebar__nav" aria-label="Navegación principal">
      ${navLink("/", "Inicio", currentPath)}
      ${
        moduleLinks
          ? `<span class="sidebar__eyebrow">Módulos</span>${moduleLinks}`
          : ""
      }
    </nav>
    <div class="sidebar__foot">
      <a class="account" href="/account" title="${escapeHtml(user.email)}" aria-label="Mi cuenta: ${escapeHtml(user.email)}">
        <span class="account__avatar" aria-hidden="true">${initial}</span>
      </a>
    </div>
  </aside>`;
}
