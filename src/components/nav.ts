import type { User } from "../modules/auth/auth.db.ts";
import { getModules } from "../core/modules.ts";
import { can } from "../core/permissions.ts";
import { escapeHtml } from "./layout.ts";

/**
 * Top navigation shared across authenticated pages. Module links are shown only
 * when the current user is permitted to view that module, so navigation always
 * reflects each user's business rules.
 */
export function nav(user: User, currentPath = ""): string {
  const links = [{ label: "Inicio", href: "/" }];
  for (const m of getModules()) {
    if (can(user, m.name, "view")) {
      links.push({ label: m.label, href: m.basePath });
    }
  }

  const linkHtml = links
    .map((l) => {
      const active =
        l.href === "/" ? currentPath === "/" : currentPath.startsWith(l.href);
      return `<a class="appnav__link${active ? " is-active" : ""}" href="${
        l.href
      }">${escapeHtml(l.label)}</a>`;
    })
    .join("");

  return `
  <style>
    .appnav { display:flex; align-items:center; justify-content:space-between; gap:1rem; padding:0.75rem 0; margin-bottom:1.5rem; border-bottom:1px solid var(--border-faint); font-size:var(--font-size-sm); }
    .appnav__links { display:flex; gap:0.25rem; flex-wrap:wrap; }
    .appnav__link { padding:0.35rem 0.7rem; border-radius:var(--radius); text-decoration:none; color:inherit; opacity:0.75; }
    .appnav__link:hover { background:color-mix(in srgb, var(--accent) 8%, transparent); opacity:1; }
    .appnav__link.is-active { color:var(--accent); opacity:1; font-weight:var(--font-weight-medium); }
    .appnav__right { display:flex; align-items:center; gap:0.75rem; }
    .appnav__who { opacity:0.7; }
    .appnav__right form { margin:0; }
    .appnav__logout { border:1px solid var(--border); background:transparent; color:inherit; border-radius:var(--radius); padding:0.35rem 0.7rem; cursor:pointer; font-size:var(--font-size-xs); }
    .appnav__logout:hover { border-color:var(--border-strong); }
  </style>
  <header class="appnav">
    <nav class="appnav__links">${linkHtml}</nav>
    <div class="appnav__right">
      <span class="appnav__who">${escapeHtml(user.email)}</span>
      <form method="POST" action="/logout">
        <button class="appnav__logout" type="submit">Cerrar sesión</button>
      </form>
    </div>
  </header>`;
}
