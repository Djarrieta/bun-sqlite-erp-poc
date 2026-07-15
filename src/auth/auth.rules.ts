/**
 * Account-validation constants shared by the auth service.
 *
 * Unlike feature modules, auth has no `ModulePermissions` matrix: account
 * actions (login, change password) are available to the relevant user
 * regardless of role, so auth never calls `registerPermissions`.
 */

/** Minimum accepted password length, enforced everywhere a password is set. */
export const MIN_PASSWORD = 8;

/** Basic email shape check — good enough for a signup gate. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}
