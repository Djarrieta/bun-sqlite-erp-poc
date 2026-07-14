/**
 * Shared page shell: base styles and the HTML document wrapper. Every module
 * renders its pages through `layout()` so re-skinning happens in one place.
 * Theme tokens live in `theme.ts`; this module just injects them.
 */
import { themeVars } from "../theme.ts";

/** Loaded on pages that use HTMX interactions. */
export const HTMX_SCRIPT = `<script src="https://unpkg.com/htmx.org@2.0.4"></script>`;

/** Base styles shared by every page. */
function baseStyles(): string {
  return `
    * { box-sizing: border-box; }
    html { -webkit-text-size-adjust: 100%; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      line-height: var(--line-height);
      color: var(--text);
      background: var(--bg);
      -webkit-font-smoothing: antialiased;
    }
    h1 {
      margin: 0 0 var(--space-5);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.01em;
    }
    a { color: var(--accent-text); }
    code, kbd, samp { font-family: var(--font-mono); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
    ::selection { background: color-mix(in srgb, var(--accent) 22%, transparent); }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }`;
}

/**
 * Reusable component styles available on every page, so modules and HTMX
 * fragments can use these classes without shipping their own CSS. This is the
 * single home for form controls, buttons, cards, page headers and alerts.
 */
function componentStyles(): string {
  return `
    /* Form controls */
    input, select, textarea {
      width: 100%;
      padding: var(--control-pad-y) var(--control-pad-x);
      font-family: inherit;
      font-size: var(--font-size-base);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: var(--surface-sunken);
      color: inherit;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    input:focus, select:focus, textarea:focus {
      outline: none;
      border-color: var(--accent);
      box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent) 22%, transparent);
    }
    input::placeholder, textarea::placeholder { color: var(--text-muted); opacity: 0.8; }
    textarea { resize: vertical; min-height: 5rem; }
    .field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); }
    .field__label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
    .field__hint { color: var(--text-muted); font-weight: var(--font-weight-normal); }
    .field__error { color: var(--danger); font-size: var(--font-size-xs); }
    .form-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-4); }

    /* Buttons (shared by <button> and link-buttons) */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
      padding: var(--control-pad-y) var(--control-pad-x);
      font-family: inherit; font-size: var(--font-size-sm); font-weight: var(--font-weight-medium);
      line-height: var(--line-height-tight);
      border: 1px solid transparent; border-radius: var(--radius);
      background: transparent; color: inherit; text-decoration: none; cursor: pointer;
      white-space: nowrap;
      transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease, transform 0.05s ease;
    }
    .btn:active { transform: translateY(1px); }
    .btn:disabled, .btn[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
    .btn--primary { background: var(--accent); color: var(--on-accent); box-shadow: var(--shadow-sm); }
    .btn--primary:hover { background: var(--accent-hover); }
    .btn--secondary { background: var(--surface); border-color: var(--border-strong); color: var(--text); }
    .btn--secondary:hover { background: var(--surface-raised); border-color: var(--text-muted); }
    .btn--danger { border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
    .btn--danger:hover { background: color-mix(in srgb, var(--danger) 12%, transparent); }
    .btn--sm { padding: var(--space-1) var(--space-2); font-size: var(--font-size-xs); }
    .btn--block { width: 100%; }

    /* Surfaces */
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-sm); }
    .card--flush { padding: 0; overflow: hidden; }

    /* Page header */
    .page-head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-6); }
    .page-head__eyebrow { display: block; font-family: var(--font-mono); font-size: var(--font-size-2xs); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; color: var(--text-muted); margin-bottom: var(--space-1); }
    .page-head__title { margin: 0; text-align: left; font-size: var(--font-size-xl); font-weight: var(--font-weight-bold); letter-spacing: -0.01em; }
    .page-head__sub { margin: var(--space-1) 0 0; color: var(--text-muted); font-size: var(--font-size-sm); }
    .page-head__actions { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); }

    /* Alerts / inline feedback */
    .alert { padding: var(--space-2) var(--space-3); border-radius: var(--radius); font-size: var(--font-size-sm); border: 1px solid transparent; margin: 0 0 var(--space-3); }
    .alert--error { background: color-mix(in srgb, var(--danger) 13%, transparent); border-color: color-mix(in srgb, var(--danger) 33%, transparent); color: var(--danger); }
    .alert--success { background: color-mix(in srgb, var(--success) 13%, transparent); border-color: color-mix(in srgb, var(--success) 33%, transparent); color: var(--success-text); }
    .alert--info { background: color-mix(in srgb, var(--accent) 13%, transparent); border-color: color-mix(in srgb, var(--accent) 33%, transparent); color: var(--accent-text); }
    .alert--warning { background: color-mix(in srgb, var(--warning) 15%, transparent); border-color: color-mix(in srgb, var(--warning) 35%, transparent); color: var(--warning); }

    /* Utilities */
    .back-link { display: inline-flex; align-items: center; gap: var(--space-1); margin-bottom: var(--space-4); font-size: var(--font-size-sm); color: var(--text-muted); text-decoration: none; }
    .back-link:hover { color: var(--text); }
    .muted { color: var(--text-muted); font-size: var(--font-size-sm); }
    .saved { color: var(--success); font-size: var(--font-size-sm); }

    /* Data tables: a self-contained surface with a search header, a table, and
       a pagination footer. Shared here so every module's list screen matches
       and so HTMX fragments (which ship no <style>) inherit these rules. */
    .data-region { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); overflow: hidden; }
    /* Let the open filter panel escape the surface's rounded clip. */
    .data-region:has(.data-filter[open]) { overflow: visible; }
    .data-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); }
    .data-search { flex: 1; min-width: 0; }
    .data-filter { position: relative; flex: 0 0 auto; }
    .data-filter__toggle { display: inline-flex; align-items: center; gap: var(--space-2); list-style: none; cursor: pointer; user-select: none; }
    .data-filter__toggle::-webkit-details-marker { display: none; }
    .data-filter__toggle::marker { content: ""; }
    .data-filter__icon { display: block; flex: 0 0 auto; }
    .data-filter[open] > .data-filter__toggle { border-color: var(--text-muted); background: var(--surface-raised); }
    .data-filter__count { display: inline-flex; align-items: center; justify-content: center; min-width: 1.1rem; height: 1.1rem; padding: 0 0.3rem; border-radius: var(--radius-full); background: var(--accent); color: var(--on-accent); font-size: var(--font-size-2xs); font-weight: var(--font-weight-semibold); line-height: 1; }
    .data-filter__panel { position: absolute; right: 0; top: calc(100% + var(--space-2)); z-index: 30; min-width: 18rem; max-width: min(22rem, calc(100vw - var(--space-6))); display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4); background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); box-shadow: var(--shadow-md); }
    .data-filter__panel .field { margin-bottom: 0; }
    .data-filter__group { border: 0; margin: 0; padding: 0; min-inline-size: 0; }
    .data-filter__group > .field__label { display: block; margin-bottom: var(--space-2); }
    .data-chips { display: flex; flex-wrap: wrap; gap: var(--space-2); }
    .data-chip { display: inline-flex; cursor: pointer; }
    .data-chip input { position: absolute; width: 1px; height: 1px; opacity: 0; margin: 0; }
    .data-chip > span { display: inline-block; padding: var(--space-1) var(--space-3); border: 1px solid var(--border-strong); border-radius: var(--radius-full); background: var(--surface); font-size: var(--font-size-sm); line-height: 1.4; user-select: none; transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease; }
    .data-chip > span:hover { border-color: var(--text-muted); }
    .data-chip:has(input:checked) > span { background: color-mix(in srgb, var(--accent) 14%, transparent); border-color: var(--accent); color: var(--accent-text); }
    .data-chip:has(input:focus-visible) > span { outline: 2px solid var(--accent); outline-offset: 2px; }
    .data-results { display: block; }
    .data-results.htmx-request { opacity: 0.55; transition: opacity 0.12s ease; }

    .data-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .data-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
    .data-table th, .data-table td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-faint); white-space: nowrap; text-align: left; }
    .data-table thead th { background: var(--surface-sunken); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); font-family: var(--font-mono); font-size: var(--font-size-2xs); color: var(--text-muted); font-weight: var(--font-weight-medium); border-bottom: 1px solid var(--border); }
    .data-table tbody td { font-variant-numeric: tabular-nums; }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table__row--link { cursor: pointer; }
    .data-table__row--link:hover { background: var(--surface-sunken); }
    .data-table__empty { text-align: center; padding: var(--space-6) 0; color: var(--text-muted); white-space: normal; }

    .data-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
    .data-pagination__info { color: var(--text-muted); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
    .data-pagination__controls { display: flex; align-items: center; gap: var(--space-2); }
    .data-pagination__page { color: var(--text-muted); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }

    /* Calendar (shared component; see components/calendar.ts). Structural only —
       item-chip colors are supplied by the calling module via renderItem. */
    .cal-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-4); }
    .cal-nav, .cal-views { display: flex; gap: var(--space-2); }
    .cal-title { flex: 1 1 auto; text-align: center; margin: 0; font-size: var(--font-size-lg); font-weight: var(--font-weight-semibold); letter-spacing: -0.01em; }
    .cal-weekdays { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-1); margin-bottom: var(--space-1); }
    .cal-weekday { text-align: center; padding: var(--space-1) 0; font-family: var(--font-mono); font-size: var(--font-size-2xs); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; color: var(--text-muted); }
    .cal-days { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-1); }
    .cal-cell { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; min-height: 6.5rem; padding: var(--space-1); border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); }
    .cal-cell--muted { background: var(--surface-sunken); }
    .cal-cell--today { border-color: var(--accent); box-shadow: 0 0 0 1px var(--accent); }
    .cal-cell__head { display: flex; justify-content: flex-end; }
    .cal-daynum { display: inline-flex; align-items: center; justify-content: center; width: 1.6rem; height: 1.6rem; border-radius: var(--radius-full); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); color: var(--text); text-decoration: none; }
    .cal-daynum:hover { background: var(--surface-raised); }
    .cal-cell--muted .cal-daynum { color: var(--text-muted); }
    .cal-cell--today .cal-daynum { background: var(--accent); color: var(--on-accent); }
    .cal-cell__events { display: flex; flex-direction: column; gap: 2px; min-width: 0; overflow: hidden; }
    .cal-chip { display: block; overflow: hidden; padding: 2px var(--space-1); border-left: 3px solid var(--border-strong); border-radius: var(--radius-sm); background: var(--surface-sunken); color: var(--text); font-size: var(--font-size-2xs); line-height: 1.35; text-decoration: none; white-space: nowrap; text-overflow: ellipsis; }
    .cal-chip:hover { background: var(--surface-raised); }
    .cal-more { padding: 0 var(--space-1); color: var(--text-muted); font-size: var(--font-size-2xs); text-decoration: none; }
    .cal-more:hover { color: var(--text); }
    .cal-week { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: var(--space-2); }
    .cal-daycol { display: flex; flex-direction: column; min-width: 0; min-height: 8rem; border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); overflow: hidden; }
    .cal-daycol--today { border-color: var(--accent); }
    .cal-daycol__head { display: block; padding: var(--space-2); text-align: center; background: var(--surface-sunken); border-bottom: 1px solid var(--border); color: var(--text); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); text-decoration: none; }
    .cal-daycol__head:hover { background: var(--surface-raised); }
    .cal-daycol--today .cal-daycol__head { background: var(--accent); color: var(--on-accent); }
    .cal-daycol__events { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2); }
    .cal-week .cal-chip { white-space: normal; }
    .cal-empty { padding: var(--space-2); text-align: center; color: var(--text-muted); text-decoration: none; border: 1px dashed var(--border); border-radius: var(--radius); }
    .cal-empty:hover { color: var(--text); border-color: var(--text-muted); }
    .cal-agenda { display: none; }
    .cal-agenda__day { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); overflow: hidden; }
    .cal-agenda__day--today { border-color: var(--accent); }
    .cal-agenda__head { display: block; padding: var(--space-2) var(--space-3); background: var(--surface-sunken); border-bottom: 1px solid var(--border); color: var(--text); font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); text-decoration: none; }
    .cal-agenda__head:hover { background: var(--surface-raised); }
    .cal-agenda__day--today .cal-agenda__head { background: var(--accent); color: var(--on-accent); }
    .cal-agenda__events { display: flex; flex-direction: column; gap: var(--space-1); padding: var(--space-2) var(--space-3); }
    .cal-agenda .cal-chip { white-space: normal; }

    /* Small screens: collapse in step with the nav (which becomes a top bar at
       860px) so tables never sit in a cropped wide-format band. */
    @media (max-width: 860px) {
      h1 { font-size: var(--font-size-lg); }
      .form-actions .btn { flex: 1 1 auto; }

      /* Mobile-first list view: drop the outer surface chrome and let each row
         collapse into its own stacked card of label/value pairs. This is the
         optimized view for the app's primary (mobile) usage. */
      .data-region { border: none; border-radius: 0; background: transparent; box-shadow: none; overflow: visible; }
      .data-toolbar { padding: 0 0 var(--space-2); border-bottom: none; }
      .data-filter__label { display: none; }
      .data-pagination { padding: var(--space-4) 0 0; border-top: none; }

      .data-table-wrap { overflow-x: visible; }
      .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
      .data-table thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }
      .data-table tr { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3); }
      .data-table td { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-faint); white-space: normal; text-align: right; }
      .data-table td:last-child { border-bottom: none; }
      .data-table td::before { content: attr(data-label); flex: 0 0 auto; font-family: var(--font-mono); font-size: var(--font-size-2xs); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; color: var(--text-muted); text-align: left; }
      .data-table td[data-label=""]::before { display: none; }
      .data-table td.data-cell--primary { justify-content: flex-start; font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); text-align: left; }
      .data-table td.data-cell--primary::before { display: none; }
      .data-table td.data-table__empty { justify-content: center; text-align: center; }
      .data-table td.data-table__empty::before { display: none; }

      /* Calendar title drops to its own full-width row above the controls. */
      .cal-title { order: -1; flex-basis: 100%; }
    }

    /* Calendar, phones: swap the 7-column month grid for the full-width agenda
       (no truncation), and stack the week's day columns. */
    @media (max-width: 640px) {
      .cal-weekdays, .cal-days { display: none; }
      .cal-agenda { display: flex; flex-direction: column; gap: var(--space-2); }
      .cal-week { grid-template-columns: 1fr; }
    }`;
}

/**
 * Wraps page content in a full HTML document with the centralized theme.
 * `pageStyles` holds styles specific to the given page.
 */
export function layout(opts: {
  title: string;
  maxWidth: string;
  margin: string;
  pageStyles: string;
  body: string;
  head?: string;
}): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${opts.title}</title>
  ${opts.head ?? ""}
  <style>
    ${themeVars()}
    ${baseStyles()}
    ${componentStyles()}
    body { max-width: ${opts.maxWidth}; margin: ${opts.margin} auto; }
    ${opts.pageStyles}
  </style>
</head>
<body>
${opts.body}
</body>
</html>`;
}

/** Escape user-supplied text to prevent XSS in server-rendered HTML. */
export function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
