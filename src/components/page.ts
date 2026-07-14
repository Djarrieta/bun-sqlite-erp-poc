/**
 * Higher-level page helpers that compose the top navigation with the shared
 * document shell (`layout.ts`). Authenticated modules should render through
 * `page()` so they don't repeat nav wiring, HTMX loading, and width/margin
 * defaults on every screen.
 */
import type { User } from "../modules/auth/auth.db.ts";
import { HTMX_SCRIPT, layout } from "./layout.ts";
import { nav } from "./nav.ts";

export interface PageOptions {
  user: User;
  /** Document title (also the browser tab text). */
  title: string;
  /** Main content rendered next to the navigation. */
  body: string;
  /** Active nav path, e.g. "/items". */
  current?: string;
  /** Caps the width of the content column (e.g. narrower for forms). */
  maxWidth?: string;
  margin?: string;
  /** Load HTMX. Defaults to true. */
  htmx?: boolean;
  /** Optional page-specific extra CSS. */
  pageStyles?: string;
}

/** A full authenticated page: sidebar shell + centered content column. */
export function page(opts: PageOptions): string {
  const inner = opts.maxWidth
    ? `<div class="app-main__inner" style="max-width:${opts.maxWidth}">`
    : `<div class="app-main__inner">`;
  return layout({
    title: opts.title,
    maxWidth: "none",
    margin: "0",
    head: opts.htmx === false ? undefined : HTMX_SCRIPT,
    pageStyles: opts.pageStyles ?? "",
    body: `<div class="app-shell">${nav(opts.user, opts.current ?? "")}<main class="app-main">${inner}${opts.body}</div></main></div>`,
  });
}

export interface PageHeaderOptions {
  /** Right-aligned actions cluster (e.g. a "+ Nuevo" button or a badge). */
  actions?: string;
  /** Small uppercase mono label above the title (e.g. the section name). */
  eyebrow?: string;
  /** Muted supporting line below the title. */
  subtitle?: string;
}

/** A page title row with an optional eyebrow, subtitle and actions cluster. */
export function pageHeader(title: string, opts: PageHeaderOptions = {}): string {
  return `<header class="page-head">
    <div>
      ${opts.eyebrow ? `<span class="page-head__eyebrow">${opts.eyebrow}</span>` : ""}
      <h1 class="page-head__title">${title}</h1>
      ${opts.subtitle ? `<p class="page-head__sub">${opts.subtitle}</p>` : ""}
    </div>
    ${opts.actions ? `<div class="page-head__actions">${opts.actions}</div>` : ""}
  </header>`;
}

/** A "back" navigation link shown above a detail or form page. */
export function backLink(href: string, label: string): string {
  return `<a class="back-link" href="${href}">${label}</a>`;
}

/**
 * Page-header + back-link styles, aggregated into the global stylesheet by
 * `layout.ts`. The title carries the display face — the app's one type accent.
 */
export const pageHeaderStyles = `
    .page-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-6); }
    .page-head__eyebrow { display: block; font-family: var(--font-mono); font-size: var(--font-size-2xs); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--space-1); }
    .page-head__title { margin: 0; text-align: left; font-family: var(--font-display); font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); letter-spacing: -0.02em; }
    .page-head__title--sub { font-size: var(--font-size-lg); letter-spacing: -0.01em; }
    .page-head__sub { margin: var(--space-1) 0 0; color: var(--text-muted); font-size: var(--font-size-sm); }
    .page-head__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }
    .back-link { display: inline-flex; align-items: center; gap: var(--space-1); margin-bottom: var(--space-4); font-size: var(--font-size-sm); color: var(--text-muted); text-decoration: none; }
    .back-link:hover { color: var(--text); }`;
