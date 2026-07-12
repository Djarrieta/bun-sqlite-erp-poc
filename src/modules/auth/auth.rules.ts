/**
 * Rules for the auth module: its identity key plus the account-validation
 * constants used by the service.
 *
 * DIVERGENCE FROM THE MODULE PATTERN: other modules export a `ModulePermissions`
 * matrix here and register it (see `items.rules.ts`). Auth intentionally does
 * NOT — account actions (login, register, change/reset password) are available
 * to the relevant user regardless of role, so there is no per-role matrix and
 * the module never calls `registerPermissions`.
 */

/** Permission/identity key for this module. */
export const AUTH_MODULE = "auth";

/** Minimum accepted password length, enforced everywhere a password is set. */
export const MIN_PASSWORD = 8;

/** Basic email shape check — good enough for a signup gate. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
