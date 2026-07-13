import type { ModulePermissions } from "../../core/permissions.ts";
import type { LocationInput, LocationKind } from "./locations.db.ts";

/** Permission key for this module (used across views and routes). */
export const LOCATIONS_MODULE = "locations";

/** All valid location kinds, in display order. */
export const LOCATION_KINDS: readonly LocationKind[] = [
  "warehouse",
  "store",
  "transit",
];

/**
 * Business rules: logistic and admin manage locations; everyone else reads.
 * Views and routes read from this single source.
 */
export const LOCATION_PERMISSIONS: ModulePermissions = {
  logistic: ["view", "create", "read", "update", "delete"],
  admin: ["view", "create", "read", "update", "delete"],
  sales: ["view", "read"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedLocationForm {
  input: LocationInput;
  errors: Record<string, string>;
}

function isKind(value: string): value is LocationKind {
  return (LOCATION_KINDS as readonly string[]).includes(value);
}

/** Valid code: starts alphanumeric, then letters/digits/dash/underscore. */
const CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]*$/;

/** Parse and validate raw location form data against the module's rules. */
export function parseLocationForm(form: FormData): ParsedLocationForm {
  const code = String(form.get("code") ?? "")
    .trim()
    .toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const kindRaw = String(form.get("kind") ?? "warehouse");
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
  if (!isKind(kindRaw)) errors.kind = "Tipo inválido.";

  const kind: LocationKind = isKind(kindRaw) ? kindRaw : "warehouse";
  return { input: { code, name, kind, isActive }, errors };
}
