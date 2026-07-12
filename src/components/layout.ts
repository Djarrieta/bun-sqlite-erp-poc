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
      padding: 0 1rem;
    }
    h1 {
      text-align: center;
      margin-bottom: 1.5rem;
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
    }
    input {
      padding: 0.65rem 0.8rem;
      font-family: inherit;
      font-size: var(--font-size-base);
      border: 1px solid var(--border);
      border-radius: var(--radius);
      background: transparent;
      color: inherit;
    }
    button.primary {
      padding: 0.65rem 1.1rem;
      font-family: inherit;
      font-size: var(--font-size-base);
      font-weight: var(--font-weight-medium);
      border: none;
      border-radius: var(--radius);
      background: var(--accent);
      color: var(--on-accent);
      cursor: pointer;
    }
    button.primary:hover { background: var(--accent-hover); }
    a { color: var(--accent); }`;
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
