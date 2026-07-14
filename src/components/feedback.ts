/**
 * Inline feedback banner (error / success / info / warning). Shares the
 * `.alert` styles from `layout.ts`. The message is escaped, so it is safe to
 * pass validation messages or echoed user input.
 */
import { escapeHtml } from "./layout.ts";

export type AlertVariant = "error" | "success" | "info" | "warning";

/** Render a status banner. Returns "" for an empty message, for easy chaining. */
export function alert(message: string, variant: AlertVariant = "info"): string {
  if (!message) return "";
  return `<p class="alert alert--${variant}">${escapeHtml(message)}</p>`;
}

/**
 * A subtle "✓ Guardado" confirmation for inline (HTMX) saves. Returns "" when
 * `shown` is false so it can be dropped straight into `formActions(...)`.
 */
export function savedIndicator(shown: boolean, label = "Guardado"): string {
  return shown ? `<span class="saved">✓ ${escapeHtml(label)}</span>` : "";
}

/**
 * A muted note that the viewer only has read access. Returns "" when they can
 * edit, so callers can interpolate it unconditionally above a disabled form.
 */
export function readOnlyNote(
  canEdit: boolean,
  message = "Tienes acceso de solo lectura."
): string {
  return canEdit ? "" : `<p class="muted">${escapeHtml(message)}</p>`;
}

/**
 * Alert + inline-feedback styles, aggregated into the global stylesheet by
 * `layout.ts`. Includes the shared `.muted` / `.saved` text utilities used by
 * `readOnlyNote()` and `savedIndicator()`.
 */
export const feedbackStyles = `
    .alert { padding: var(--space-2) var(--space-3); border-radius: var(--radius); font-size: var(--font-size-sm); border: 1px solid transparent; margin: 0 0 var(--space-3); }
    .alert--error { background: color-mix(in srgb, var(--danger) 13%, transparent); border-color: color-mix(in srgb, var(--danger) 33%, transparent); color: var(--danger); }
    .alert--success { background: color-mix(in srgb, var(--success) 13%, transparent); border-color: color-mix(in srgb, var(--success) 33%, transparent); color: var(--success-text); }
    .alert--info { background: color-mix(in srgb, var(--accent) 13%, transparent); border-color: color-mix(in srgb, var(--accent) 33%, transparent); color: var(--accent-text); }
    .alert--warning { background: color-mix(in srgb, var(--warning) 15%, transparent); border-color: color-mix(in srgb, var(--warning) 35%, transparent); color: var(--warning); }
    .muted { color: var(--text-muted); font-size: var(--font-size-sm); }
    .saved { color: var(--success); font-size: var(--font-size-sm); }`;
