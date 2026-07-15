import type { User } from "./auth/auth.db.ts";
import { escapeHtml, page } from "./components/index.ts";
import { getModules } from "./core/modules.ts";
import { can } from "./core/permissions.ts";

const PAGE_STYLES = `
  .hero { margin-bottom: var(--space-7); }
  .hero__eyebrow { display:block; font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--accent-text); margin-bottom:var(--space-3); }
  .hero__title { margin:0; max-width:18ch; font-family:var(--font-display); font-size:var(--font-size-2xl); font-weight:var(--font-weight-bold); letter-spacing:-0.03em; line-height:1.05; }
  .hero__lede { margin:var(--space-3) 0 0; max-width:54ch; color:var(--text-muted); font-size:var(--font-size-lg); line-height:1.4; }
  .hero__meta { display:flex; flex-wrap:wrap; gap:var(--space-2) var(--space-5); margin:var(--space-5) 0 0; padding-top:var(--space-4); border-top:1px solid var(--border); font-family:var(--font-mono); font-size:var(--font-size-xs); }
  .hero__meta > div { display:flex; gap:var(--space-2); align-items:baseline; }
  .hero__meta dt { margin:0; color:var(--text-muted); text-transform:uppercase; letter-spacing:var(--letter-spacing-wide); }
  .hero__meta dd { margin:0; color:var(--text); font-variant-numeric:tabular-nums; }

  .home-modules__eyebrow { display:block; font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); margin-bottom:var(--space-3); }
  .tiles { display:grid; grid-template-columns:repeat(auto-fill, minmax(230px, 1fr)); gap:var(--space-4); }
  .tile { display:flex; flex-direction:column; gap:var(--space-2); min-height:132px; padding:var(--space-5); background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); text-decoration:none; color:inherit; transition:border-color .15s ease, transform .15s ease, box-shadow .15s ease; }
  .tile:hover { border-color:var(--border-strong); transform:translateY(-2px); box-shadow:var(--shadow-md); }
  .tile__name { font-family:var(--font-display); font-size:var(--font-size-lg); font-weight:var(--font-weight-semibold); letter-spacing:-0.01em; }
  .tile__desc { color:var(--text-muted); font-size:var(--font-size-sm); }
  .tile__go { margin-top:auto; font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--accent-text); }

  @media (max-width: 860px) {
    .hero__title { font-size: var(--font-size-xl); }
    .hero__lede { font-size: var(--font-size-base); }
  }
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

  const today = new Date().toLocaleDateString("es-ES", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const body = `
  <header class="hero">
    <span class="hero__eyebrow">Núcleo · Panel operativo</span>
    <h1 class="hero__title">Un núcleo para toda tu operación.</h1>
    <p class="hero__lede">Inventario, ubicaciones, movimientos y agenda, al día en un solo lugar.</p>
    <dl class="hero__meta">
      <div><dt>Rol</dt><dd>${escapeHtml(user.role)}</dd></div>
      <div><dt>Fecha</dt><dd>${escapeHtml(today)}</dd></div>
    </dl>
  </header>
  <section aria-label="Módulos">
    <span class="home-modules__eyebrow">Módulos</span>
    <div class="tiles">${tiles.join("")}</div>
  </section>`;

  return page({
    user,
    current: "/",
    title: "Inicio · App",
    body,
    htmx: false,
    pageStyles: PAGE_STYLES,
  });
}

