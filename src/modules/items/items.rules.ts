import type { ModulePermissions } from "../../core/permissions.ts";
import { parseTags, type ItemInput, type ItemStatus } from "./items.db.ts";

/** Permission key for this module (used across views and routes). */
export const ITEMS_MODULE = "items";

/** All valid statuses, in display order. */
export const ITEM_STATUSES: readonly ItemStatus[] = [
  "draft",
  "active",
  "archived",
];

/**
 * Business rules: who can do what in the items module. Change a role's list to
 * adjust its capabilities; views and routes read from this single source.
 *   - logistic: full CRUD.
 *   - everyone else (admin, sales, financial, engineer, member): read-only.
 */
export const ITEM_PERMISSIONS: ModulePermissions = {
  logistic: ["view", "create", "read", "update", "delete"],
  admin: ["view", "read"],
  sales: ["view", "read"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedItemForm {
  input: ItemInput;
  errors: Record<string, string>;
}

function isStatus(value: string): value is ItemStatus {
  return (ITEM_STATUSES as readonly string[]).includes(value);
}

/** Parse and validate raw item form data against the module's rules. */
export function parseItemForm(form: FormData): ParsedItemForm {
  const name = String(form.get("name") ?? "").trim();
  const tags = parseTags(String(form.get("tags") ?? ""));
  const statusRaw = String(form.get("status") ?? "draft");

  const errors: Record<string, string> = {};
  if (!name) errors.name = "El nombre es obligatorio.";
  else if (name.length > 120)
    errors.name = "El nombre no puede superar 120 caracteres.";
  if (tags.length > 20) errors.tags = "Demasiadas etiquetas (máximo 20).";
  if (!isStatus(statusRaw)) errors.status = "Estado inválido.";

  const status: ItemStatus = isStatus(statusRaw) ? statusRaw : "draft";
  return { input: { name, tags, status }, errors };
}
