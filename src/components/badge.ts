/** A small status pill, themable via variants. Self-contained inline styles. */

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

const VARIANT_COLOR: Record<BadgeVariant, string> = {
  neutral: "var(--border-strong)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--accent)",
};

/**
 * Renders a status pill. `label` is treated as trusted, short text — escape it
 * at the call site if it can contain user input.
 */
export function badge(label: string, variant: BadgeVariant = "neutral"): string {
  const color = VARIANT_COLOR[variant];
  return `<span style="display:inline-block;padding:0.15rem 0.6rem;border-radius:999px;font-size:var(--font-size-xs);font-weight:var(--font-weight-medium);line-height:1.4;color:${color};background:color-mix(in srgb, ${color} 15%, transparent);border:1px solid color-mix(in srgb, ${color} 35%, transparent)">${label}</span>`;
}
