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
