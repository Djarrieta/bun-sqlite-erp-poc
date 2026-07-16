import type { ModulePermissions } from "../../core/permissions.ts";
import type { ProjectInput, ProjectStatus } from "./projects.db.ts";

/** Permission key for this module (used across views and routes). */
export const PROJECTS_MODULE = "projects";

/** All valid statuses, in display order. */
export const PROJECT_STATUSES: readonly ProjectStatus[] = [
  "prospect",
  "active",
  "on_hold",
  "done",
  "cancelled",
];

/**
 * Business rules: sales, admin, engineer and logistic manage projects (they run
 * the field work and equipment moves); financial and member read only.
 */
export const PROJECT_PERMISSIONS: ModulePermissions = {
  sales: ["view", "create", "read", "update", "delete"],
  admin: ["view", "create", "read", "update", "delete"],
  engineer: ["view", "create", "read", "update", "delete"],
  logistic: ["view", "create", "read", "update", "delete"],
  financial: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedProjectForm {
  input: ProjectInput;
  errors: Record<string, string>;
}

/** Valid code: starts alphanumeric, then letters/digits/dash/underscore. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;
/** date input values look like "2026-07-14". */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: string): value is ProjectStatus {
  return (PROJECT_STATUSES as readonly string[]).includes(value);
}

/** Parse a positive integer id from a form value, or null. */
function parseId(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parse and validate raw project form data. The company is required; the route
 * cross-checks that the id exists. Dates are optional but must be well-formed,
 * and the end date cannot precede the start date.
 */
export function parseProjectForm(form: FormData): ParsedProjectForm {
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const companyId = parseId(form.get("company_id"));
  const statusRaw = String(form.get("status") ?? "prospect");
  const startDate = String(form.get("start_date") ?? "").trim();
  const endDate = String(form.get("end_date") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!code) errors.code = "El código es obligatorio.";
  else if (code.length > 30)
    errors.code = "El código no puede superar 30 caracteres.";
  else if (!CODE_PATTERN.test(code))
    errors.code = "Usa solo letras, números, guion y guion bajo.";

  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 120)
    errors.name = "El nombre no puede superar 120 caracteres.";

  if (!companyId) errors.company_id = "Selecciona una compañía.";
  if (!isStatus(statusRaw)) errors.status = "Estado inválido.";

  if (startDate && !DATE_PATTERN.test(startDate))
    errors.start_date = "Fecha de inicio inválida.";
  if (endDate && !DATE_PATTERN.test(endDate))
    errors.end_date = "Fecha de fin inválida.";
  if (
    !errors.start_date &&
    !errors.end_date &&
    startDate &&
    endDate &&
    endDate < startDate
  )
    errors.end_date = "La fecha de fin no puede ser anterior al inicio.";

  if (description.length > 2000)
    errors.description = "La descripción no puede superar 2000 caracteres.";

  const status: ProjectStatus = isStatus(statusRaw) ? statusRaw : "prospect";
  return {
    input: {
      code,
      name,
      companyId: companyId ?? 0,
      status,
      startDate,
      endDate,
      description,
    },
    errors,
  };
}
