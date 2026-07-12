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
    body {
      font-family: var(--font-family);
      font-size: var(--font-size-base);
      line-height: var(--line-height);
      padding: 0 var(--space-4);
    }
    h1 {
      text-align: center;
      margin-bottom: var(--space-5);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
    }
    a { color: var(--accent); }`;
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
      background: transparent;
      color: inherit;
    }
    input:focus, select:focus, textarea:focus {
      outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent);
      outline-offset: 1px;
      border-color: var(--accent);
    }
    textarea { resize: vertical; min-height: 5rem; }
    .field { display: flex; flex-direction: column; gap: var(--space-1); margin-bottom: var(--space-3); }
    .field__label { font-size: var(--font-size-sm); font-weight: var(--font-weight-medium); }
    .field__hint { opacity: 0.6; font-weight: var(--font-weight-normal); }
    .field__error { color: var(--danger); font-size: var(--font-size-xs); }
    .form-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; margin-top: var(--space-4); }

    /* Buttons (shared by <button> and link-buttons) */
    .btn {
      display: inline-flex; align-items: center; justify-content: center; gap: var(--space-2);
      padding: var(--control-pad-y) var(--control-pad-x);
      font-family: inherit; font-size: var(--font-size-base); font-weight: var(--font-weight-medium);
      line-height: var(--line-height-tight);
      border: 1px solid transparent; border-radius: var(--radius);
      background: transparent; color: inherit; text-decoration: none; cursor: pointer;
      white-space: nowrap;
    }
    .btn:disabled, .btn[aria-disabled="true"] { opacity: 0.5; cursor: not-allowed; }
    .btn--primary { background: var(--accent); color: var(--on-accent); }
    .btn--primary:hover { background: var(--accent-hover); }
    .btn--secondary { border-color: var(--border); }
    .btn--secondary:hover { border-color: var(--border-strong); }
    .btn--danger { border-color: color-mix(in srgb, var(--danger) 40%, transparent); color: var(--danger); }
    .btn--danger:hover { background: color-mix(in srgb, var(--danger) 10%, transparent); }
    .btn--sm { padding: var(--space-1) var(--space-2); font-size: var(--font-size-xs); }
    .btn--block { width: 100%; }

    /* Surfaces */
    .card { border: 1px solid var(--border); border-radius: var(--radius); padding: var(--space-5); }

    /* Page header */
    .page-head { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); margin-bottom: var(--space-5); }
    .page-head__title { margin: 0; text-align: left; font-size: var(--font-size-lg); font-weight: var(--font-weight-bold); }
    .page-head__actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }

    /* Alerts / inline feedback */
    .alert { padding: var(--space-2) var(--space-3); border-radius: var(--radius); font-size: var(--font-size-sm); border: 1px solid transparent; margin: 0 0 var(--space-3); }
    .alert--error { background: color-mix(in srgb, var(--danger) 13%, transparent); border-color: color-mix(in srgb, var(--danger) 33%, transparent); color: var(--danger); }
    .alert--success { background: color-mix(in srgb, var(--success) 13%, transparent); border-color: color-mix(in srgb, var(--success) 33%, transparent); color: var(--success-text); }
    .alert--info { background: color-mix(in srgb, var(--accent) 13%, transparent); border-color: color-mix(in srgb, var(--accent) 33%, transparent); color: var(--accent); }
    .alert--warning { background: color-mix(in srgb, var(--warning) 15%, transparent); border-color: color-mix(in srgb, var(--warning) 35%, transparent); color: var(--warning); }

    /* Utilities */
    .back-link { display: inline-block; margin-bottom: var(--space-4); font-size: var(--font-size-sm); }
    .muted { opacity: 0.7; font-size: var(--font-size-sm); }

    /* Small screens */
    @media (max-width: 640px) {
      body { padding: 0 var(--space-3); }
      h1 { font-size: var(--font-size-lg); }
      .form-actions .btn { flex: 1 1 auto; }
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
