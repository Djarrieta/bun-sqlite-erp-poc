/** A small status pill, themable via variants. Styles are aggregated into the
 *  global stylesheet by `layout.ts` (see `badgeStyles`). */

export type BadgeVariant =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

/**
 * Renders a status pill. `label` is treated as trusted, short text — escape it
 * at the call site if it can contain user input.
 */
export function badge(label: string, variant: BadgeVariant = "neutral"): string {
  return `<span class="badge badge--${variant}">${label}</span>`;
}

/** Badge styles. Each variant tints the same pill from a semantic token. */
export const badgeStyles = `
    .badge { display: inline-block; padding: 0.15rem 0.6rem; border-radius: var(--radius-full); font-size: var(--font-size-xs); font-weight: var(--font-weight-medium); line-height: 1.4; border: 1px solid transparent; }
    .badge--neutral { color: var(--text-muted); background: color-mix(in srgb, var(--border-strong) 15%, transparent); border-color: color-mix(in srgb, var(--border-strong) 45%, transparent); }
    .badge--success { color: var(--success-text); background: color-mix(in srgb, var(--success) 15%, transparent); border-color: color-mix(in srgb, var(--success) 35%, transparent); }
    .badge--warning { color: var(--warning); background: color-mix(in srgb, var(--warning) 15%, transparent); border-color: color-mix(in srgb, var(--warning) 35%, transparent); }
    .badge--danger { color: var(--danger); background: color-mix(in srgb, var(--danger) 15%, transparent); border-color: color-mix(in srgb, var(--danger) 35%, transparent); }
    .badge--info { color: var(--accent-text); background: color-mix(in srgb, var(--accent) 15%, transparent); border-color: color-mix(in srgb, var(--accent) 35%, transparent); }`;
