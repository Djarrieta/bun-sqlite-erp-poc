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
