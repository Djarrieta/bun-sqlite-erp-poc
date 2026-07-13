import type { ModulePermissions } from "../../core/permissions.ts";

/** Permission key for this module (used across views and routes). */
export const INVENTORY_MODULE = "inventory";

/**
 * Business rules: inventory is read-only from the UI — the movements module
 * owns every write via confirmed movements. Manual adjustments (which would
 * grant admin `update`) are out of the first cut (see plan §8).
 */
export const INVENTORY_PERMISSIONS: ModulePermissions = {
  logistic: ["view", "read"],
  admin: ["view", "read"],
  sales: ["view", "read"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  member: ["view", "read"],
};
