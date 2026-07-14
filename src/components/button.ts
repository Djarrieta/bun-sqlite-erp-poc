/**
 * Reusable button and link-button. Both share the `.btn` styles defined in
 * `layout.ts`, so any page or HTMX fragment can render consistent actions
 * without shipping its own CSS.
 */

export type ButtonVariant = "primary" | "secondary" | "danger";
export type ButtonSize = "md" | "sm";

interface CommonButtonOptions {
  /** Trusted, short label (escape at the call site if it can contain user input). */
  label: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Stretch to fill the available width. */
  block?: boolean;
  /** Extra raw attributes, e.g. `hx-delete="/x" hx-confirm="..."`. */
  attrs?: string;
}

function classes(
  variant: ButtonVariant,
  size: ButtonSize,
  block?: boolean
): string {
  return [
    "btn",
    `btn--${variant}`,
    size === "sm" ? "btn--sm" : "",
    block ? "btn--block" : "",
  ]
    .filter(Boolean)
    .join(" ");
}

export interface ButtonOptions extends CommonButtonOptions {
  /** Button type. Defaults to "submit". */
  type?: "submit" | "button" | "reset";
}

/** A `<button>` element with a themeable variant. */
export function button(opts: ButtonOptions): string {
  const {
    label,
    variant = "primary",
    size = "md",
    block,
    attrs,
    type = "submit",
  } = opts;
  return `<button class="${classes(variant, size, block)}" type="${type}"${
    attrs ? " " + attrs : ""
  }>${label}</button>`;
}

export interface LinkButtonOptions extends CommonButtonOptions {
  href: string;
}

/** An `<a>` styled as a button — for navigation actions (e.g. "Cancelar"). */
export function linkButton(opts: LinkButtonOptions): string {
  const { label, href, variant = "primary", size = "md", block, attrs } = opts;
  return `<a class="${classes(variant, size, block)}" href="${href}"${
    attrs ? " " + attrs : ""
  }>${label}</a>`;
}

/**
 * Button styles, aggregated into the global stylesheet by `layout.ts` so both
 * full pages and HTMX fragments render actions consistently.
 */
export const buttonStyles = `
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
    .btn--block { width: 100%; }`;
