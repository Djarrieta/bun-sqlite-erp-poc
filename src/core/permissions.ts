/**
 * Central permission engine. Each feature module declares which actions every
 * role may perform; views and route handlers ask `can(...)` before rendering
 * controls or mutating data. This keeps business rules in one place per module
 * and makes them trivial to audit and change.
 */

export type Action = "view" | "create" | "read" | "update" | "delete";

export type Role =
  | "admin"
  | "sales"
  | "financial"
  | "engineer"
  | "logistic"
  | "member";

/** Maps a role to the list of actions it is allowed to perform in a module. */
export type ModulePermissions = Record<string, Action[]>;

const registry = new Map<string, ModulePermissions>();

/** Register (or replace) the permission table for a module. */
export function registerPermissions(
  module: string,
  perms: ModulePermissions
): void {
  registry.set(module, perms);
}

/** Whether `user` may perform `action` in `module`. Deny by default. */
export function can(
  user: { role: string },
  module: string,
  action: Action
): boolean {
  const perms = registry.get(module);
  if (!perms) return false;
  return (perms[user.role] ?? []).includes(action);
}

/** All actions `user` may perform in `module` (useful for rendering views). */
export function allowedActions(
  user: { role: string },
  module: string
): Action[] {
  return registry.get(module)?.[user.role] ?? [];
}
