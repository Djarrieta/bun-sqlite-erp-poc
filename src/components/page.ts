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
  /** Main content rendered below the navigation. */
  body: string;
  /** Active nav path, e.g. "/items". */
  current?: string;
  maxWidth?: string;
  margin?: string;
  /** Load HTMX. Defaults to true. */
  htmx?: boolean;
  /** Optional page-specific extra CSS. */
  pageStyles?: string;
}

/** A full authenticated page: top nav + centered content through the shell. */
export function page(opts: PageOptions): string {
  return layout({
    title: opts.title,
    maxWidth: opts.maxWidth ?? "820px",
    margin: opts.margin ?? "2.5rem",
    head: opts.htmx === false ? undefined : HTMX_SCRIPT,
    pageStyles: opts.pageStyles ?? "",
    body: `${nav(opts.user, opts.current ?? "")}\n${opts.body}`,
  });
}

export interface PageHeaderOptions {
  /** Right-aligned actions cluster (e.g. a "+ Nuevo" button or a badge). */
  actions?: string;
}

/** A page title row with an optional actions cluster on the right. */
export function pageHeader(title: string, opts: PageHeaderOptions = {}): string {
  return `<header class="page-head">
    <h1 class="page-head__title">${title}</h1>
    ${opts.actions ? `<div class="page-head__actions">${opts.actions}</div>` : ""}
  </header>`;
}

/** A "back" navigation link shown above a detail or form page. */
export function backLink(href: string, label: string): string {
  return `<a class="back-link" href="${href}">${label}</a>`;
}
