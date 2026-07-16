import type { ModulePermissions } from "../../core/permissions.ts";
import type { CompanyInput } from "./companies.db.ts";

/** Permission key for this module (used across views and routes). */
export const COMPANIES_MODULE = "companies";

/**
 * Business rules: sales and admin manage companies; everyone else reads.
 * Views and routes read from this single source.
 */
export const COMPANY_PERMISSIONS: ModulePermissions = {
  sales: ["view", "create", "read", "update", "delete"],
  admin: ["view", "create", "read", "update", "delete"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  logistic: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedCompanyForm {
  input: CompanyInput;
  errors: Record<string, string>;
}

/** Valid code: starts alphanumeric, then letters/digits/dash/underscore. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
/** Light email sanity check (real validation happens on send). */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Parse and validate raw company form data against the module's rules. */
export function parseCompanyForm(form: FormData): ParsedCompanyForm {
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const industry = String(form.get("industry") ?? "").trim();
  const website = String(form.get("website") ?? "").trim();
  const phone = String(form.get("phone") ?? "").trim();
  const email = String(form.get("email") ?? "").trim();
  const notes = String(form.get("notes") ?? "").trim();
  const isActive = String(form.get("is_active") ?? "1") === "1";

  const errors: Record<string, string> = {};
  if (!code) errors.code = "El código es obligatorio.";
  else if (code.length > 30)
    errors.code = "El código no puede superar 30 caracteres.";
  else if (!CODE_PATTERN.test(code))
    errors.code = "Usa solo letras, números, guion y guion bajo.";

  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 120)
    errors.name = "El nombre no puede superar 120 caracteres.";

  if (industry.length > 80)
    errors.industry = "La industria no puede superar 80 caracteres.";
  if (website.length > 200)
    errors.website = "El sitio web no puede superar 200 caracteres.";
  if (phone.length > 40)
    errors.phone = "El teléfono no puede superar 40 caracteres.";
  if (email && !EMAIL_PATTERN.test(email))
    errors.email = "Correo electrónico inválido.";
  else if (email.length > 160)
    errors.email = "El correo no puede superar 160 caracteres.";
  if (notes.length > 1000)
    errors.notes = "Las notas no pueden superar 1000 caracteres.";

  return {
    input: { code, name, industry, website, phone, email, isActive, notes },
    errors,
  };
}
