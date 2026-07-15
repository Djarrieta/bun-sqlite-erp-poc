import type { ModulePermissions, Role } from "../../core/permissions.ts";

/** Permission key for this module. */
export const USERS_MODULE = "users";

/** Assignable roles, in display order. The default assigned to new users is `member`. */
export const USER_ROLES: readonly Role[] = [
  "admin",
  "sales",
  "financial",
  "engineer",
  "logistic",
  "member",
];

/**
 * Business rules: only admins may manage users. Members have no access to this
 * module at all (self-service password changes live under /account instead).
 */
export const USER_PERMISSIONS: ModulePermissions = {
  admin: ["view", "create", "delete", "update"],
};

export interface ParsedNewUser {
  email: string;
  password: string;
  role: Role;
  errors: Record<string, string>;
}

function isRole(value: string): value is Role {
  return (USER_ROLES as readonly string[]).includes(value);
}

/** Parse and validate the "new user" admin form. */
export function parseNewUserForm(form: FormData): ParsedNewUser {
  const email = String(form.get("email") ?? "")
    .trim()
    .toLowerCase();
  const password = String(form.get("password") ?? "");
  const roleRaw = String(form.get("role") ?? "member");

  const errors: Record<string, string> = {};
  if (!email) errors.email = "El correo es obligatorio.";
  if (password.length < 8)
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  if (!isRole(roleRaw)) errors.role = "Rol inválido.";

  const role: Role = isRole(roleRaw) ? roleRaw : "member";
  return { email, password, role, errors };
}

/**
 * Parse and validate the admin "set temporary password" form. Admins override a
 * user's password without knowing the current one, so only the new password is
 * validated here.
 */
export function parsePasswordForm(form: FormData): {
  password: string;
  errors: Record<string, string>;
} {
  const password = String(form.get("password") ?? "");
  const errors: Record<string, string> = {};
  if (password.length < 8)
    errors.password = "La contraseña debe tener al menos 8 caracteres.";
  return { password, errors };
}

/**
 * Parse and validate the admin "link Telegram" form. Telegram user ids are
 * numeric; we store them as text. An empty value clears the link (unlink).
 */
export function parseTelegramForm(form: FormData): {
  telegramId: string | null;
  errors: Record<string, string>;
} {
  const raw = String(form.get("telegram_id") ?? "").trim();
  const errors: Record<string, string> = {};
  if (raw && !/^\d{1,20}$/.test(raw))
    errors.telegram_id = "El ID de Telegram debe ser numérico (1 a 20 dígitos).";
  return { telegramId: raw ? raw : null, errors };
}

/**
 * Generate a random temporary password for admin-created accounts. Uses an
 * ambiguity-free alphabet (no 0/O/1/l/I) so it is easy to read and copy.
 */
export function generateTempPassword(length = 14): string {
  const alphabet =
    "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[bytes[i]! % alphabet.length];
  return out;
}
