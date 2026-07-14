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
