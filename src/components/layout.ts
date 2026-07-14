/**
 * Shared page shell: base styles, the self-hosted @font-face declarations, and
 * the HTML document wrapper. Every module renders its pages through `layout()`,
 * which stitches each component's own styles into one global stylesheet so
 * re-skinning happens in one place. Theme tokens live in `theme.ts`.
 */
import { themeVars } from "../theme.ts";
import { badgeStyles } from "./badge.ts";
import { buttonStyles } from "./button.ts";
import { calendarStyles } from "./calendar.ts";
import { cardStyles } from "./card.ts";
import { feedbackStyles } from "./feedback.ts";
import { filterStyles } from "./filter.ts";
import { formStyles } from "./form.ts";
import { navStyles } from "./nav.ts";
import { pageHeaderStyles } from "./page.ts";
import { tableStyles } from "./table.ts";

/** Loaded on pages that use HTMX interactions. */
export const HTMX_SCRIPT = `<script src="https://unpkg.com/htmx.org@2.0.4"></script>`;

/**
 * `@font-face` declarations for the self-hosted variable fonts (served from
 * `/fonts/*` by `index.ts`). One woff2 per family covers the whole weight axis,
 * so the payload stays small and the app never calls a third-party font CDN.
 */
function fontFaces(): string {
  return `
    @font-face { font-family: "Inter"; font-style: normal; font-weight: 100 900; font-display: swap; src: url("/fonts/inter-latin-wght-normal.woff2") format("woff2"); }
    @font-face { font-family: "Space Grotesk"; font-style: normal; font-weight: 300 700; font-display: swap; src: url("/fonts/space-grotesk-latin-wght-normal.woff2") format("woff2"); }
    @font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 100 800; font-display: swap; src: url("/fonts/jetbrains-mono-latin-wght-normal.woff2") format("woff2"); }`;
}

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
      font-family: var(--font-display);
      font-size: var(--font-size-xl);
      font-weight: var(--font-weight-bold);
      letter-spacing: -0.02em;
    }
    a { color: var(--accent-text); }
    code, kbd, samp { font-family: var(--font-mono); }
    :focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; border-radius: var(--radius-sm); }
    ::selection { background: color-mix(in srgb, var(--accent) 22%, transparent); }
    @media (max-width: 860px) {
      h1 { font-size: var(--font-size-lg); }
    }
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; }
    }`;
}

/**
 * Aggregates every component's own styles into the single global stylesheet.
 * Each component exports its CSS next to its markup (e.g. `button.ts` exports
 * `buttonStyles`); this is the one place that stitches them together, so full
 * pages and HTMX fragments — which ship no `<style>` — share one source of
 * truth. To restyle a component, edit the CSS in that component's file.
 */
function componentStyles(): string {
  return [
    navStyles,
    formStyles,
    buttonStyles,
    badgeStyles,
    cardStyles,
    pageHeaderStyles,
    feedbackStyles,
    tableStyles,
    filterStyles,
    calendarStyles,
  ].join("\n");
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
    ${fontFaces()}
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
