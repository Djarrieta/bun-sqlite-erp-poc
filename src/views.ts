import type { User } from "./modules/auth/auth.db.ts";
import { escapeHtml, layout } from "./components/layout.ts";
import { nav } from "./components/nav.ts";
import { getModules } from "./core/modules.ts";
import { can } from "./core/permissions.ts";

const PAGE_STYLES = `
  .welcome { margin-bottom:2rem; }
  .welcome h1 { text-align:left; font-size:var(--font-size-xl); margin-bottom:0.25rem; }
  .welcome p { opacity:0.7; margin:0; }
  .cards { display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:1rem; }
  .module-card { display:block; padding:1.25rem; border:1px solid var(--border); border-radius:var(--radius); text-decoration:none; color:inherit; }
  .module-card:hover { border-color:var(--border-strong); background:color-mix(in srgb, var(--accent) 6%, transparent); }
  .module-card strong { display:block; font-size:var(--font-size-lg); margin-bottom:0.25rem; }
  .module-card span { opacity:0.65; font-size:var(--font-size-sm); }
`;

/** Simple dashboard shown at "/", linking to the modules the user can access. */
export function homePage(user: User): string {
  const cards = getModules()
    .filter((m) => can(user, m.name, "view"))
    .map(
      (m) =>
        `<a class="module-card" href="${m.basePath}"><strong>${escapeHtml(
          m.label
        )}</strong><span>Ir a ${escapeHtml(m.label)}</span></a>`
    );
  cards.push(
    `<a class="module-card" href="/account"><strong>Mi cuenta</strong><span>Cambiar contraseña</span></a>`
  );

  const body = `
  ${nav(user, "/")}
  <div class="welcome">
    <h1>Hola 👋</h1>
    <p>${escapeHtml(user.email)}</p>
  </div>
  <div class="cards">${cards.join("")}</div>`;

  return layout({
    title: "Inicio · App",
    maxWidth: "820px",
    margin: "2.5rem",
    pageStyles: PAGE_STYLES,
    body,
  });
}
