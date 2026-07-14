/**
 * A bordered surface container (styles live in `layout.ts`). Render as a plain
 * `<div>` by default, or as a `<form>` for form cards by passing `as: "form"`.
 */

export interface CardOptions {
  /** Element tag to render. Defaults to "div"; use "form" for form cards. */
  as?: string;
  /** Extra classes appended after `card`. */
  class?: string;
  /** Extra raw attributes, e.g. form method/action or hx-* attributes. */
  attrs?: string;
}

/** Wrap already-rendered HTML content in a `.card` surface. */
export function card(content: string, opts: CardOptions = {}): string {
  const tag = opts.as ?? "div";
  const cls = opts.class ? `card ${opts.class}` : "card";
  return `<${tag} class="${cls}"${
    opts.attrs ? " " + opts.attrs : ""
  }>${content}</${tag}>`;
}

/** Card surface styles, aggregated into the global stylesheet by `layout.ts`. */
export const cardStyles = `
    .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: var(--space-5); box-shadow: var(--shadow-sm); }
    .card--flush { padding: 0; overflow: hidden; }`;
