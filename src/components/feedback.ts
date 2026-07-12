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
