import type { ModulePermissions } from "../../core/permissions.ts";
import type { ContactInput } from "./contacts.db.ts";

/** Permission key for this module (used across views and routes). */
export const CONTACTS_MODULE = "contacts";

/**
 * Business rules: sales and admin manage contacts; everyone else reads.
 * Views and routes read from this single source.
 */
export const CONTACT_PERMISSIONS: ModulePermissions = {
  sales: ["view", "create", "read", "update", "delete"],
  admin: ["view", "create", "read", "update", "delete"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  logistic: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedContactForm {
  input: ContactInput;
  errors: Record<string, string>;
}

/** Light email sanity check (real validation happens on send). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse a positive integer id from a form value, or null. */
function parseId(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parse and validate raw contact form data. The company is optional; when
 * present, the route cross-checks that it exists (a tampered id can't link to
 * a non-existent company).
 */
export function parseContactForm(form: FormData): ParsedContactForm {
  const name = String(form.get("name") ?? "").trim();
  const title = String(form.get("title") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const companyId = parseId(form.get("company_id"));
  const isActive = String(form.get("is_active") ?? "1") === "1";

  const errors: Record<string, string> = {};
  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 120)
    errors.name = "El nombre no puede superar 120 caracteres.";
  if (title.length > 80)
    errors.title = "El cargo no puede superar 80 caracteres.";
  if (email && !EMAIL_PATTERN.test(email))
    errors.email = "Correo electrónico inválido.";
  else if (email.length > 160)
    errors.email = "El correo no puede superar 160 caracteres.";
  if (phone.length > 40)
    errors.phone = "El teléfono no puede superar 40 caracteres.";
  if (notes.length > 1000)
    errors.notes = "Las notas no pueden superar 1000 caracteres.";

  return {
    input: { name, title, email, phone, companyId, isActive, notes },
    errors,
  };
}
