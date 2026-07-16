import type { ModulePermissions } from "../../core/permissions.ts";
import type { VisitInput } from "./visits.db.ts";

/** Permission key for this module (used across views and routes). */
export const VISITS_MODULE = "visits";

/**
 * Business rules: sales and admin log and edit visits (bitácoras); everyone
 * else reads. Shared org-wide. Audio visits arrive through the Telegram bot,
 * which resolves the sender to a user and checks this same `create` permission.
 */
export const VISIT_PERMISSIONS: ModulePermissions = {
  sales: ["view", "create", "read", "update", "delete"],
  admin: ["view", "create", "read", "update", "delete"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  logistic: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedVisitForm {
  input: VisitInput;
  errors: Record<string, string>;
}

/** Parse a positive integer id from a form value, or null. */
function parseId(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parse and validate the web visit form. A visit must reference a company or a
 * project (or both), and carry notes. The route cross-checks that the ids exist.
 */
export function parseVisitForm(form: FormData): ParsedVisitForm {
  const companyId = parseId(form.get("company_id"));
  const projectId = parseId(form.get("project_id"));
  const notes = String(form.get("notes") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!companyId && !projectId)
    errors.company_id = "Selecciona una compañía o un proyecto.";
  if (!notes) errors.notes = "Escribe las notas de la visita.";
  else if (notes.length > 4000)
    errors.notes = "Las notas no pueden superar 4000 caracteres.";

  return { input: { companyId, projectId, notes }, errors };
}
