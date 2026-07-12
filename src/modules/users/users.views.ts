import type { User } from "../auth/auth.db.ts";
import { escapeHtml } from "../../components/layout.ts";
import { badge, type BadgeVariant } from "../../components/badge.ts";
import { table } from "../../components/table.ts";
import { page, pageHeader, backLink } from "../../components/page.ts";
import { card } from "../../components/card.ts";
import { textField, selectField, formActions } from "../../components/form.ts";
import { button, linkButton } from "../../components/button.ts";
import type { Role } from "../../core/permissions.ts";
import { USER_ROLES } from "./users.rules.ts";

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  admin: "info",
  sales: "success",
  financial: "warning",
  engineer: "neutral",
  logistic: "danger",
  member: "neutral",
};
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  sales: "Ventas",
  financial: "Finanzas",
  engineer: "Ingeniería",
  logistic: "Logística",
  member: "Miembro",
};

const ROLE_OPTIONS = USER_ROLES.map((r) => ({
  value: r,
  label: ROLE_LABEL[r] ?? r,
}));

function roleBadge(role: string): string {
  return badge(ROLE_LABEL[role] ?? role, ROLE_VARIANT[role] ?? "neutral");
}

function fmtDate(value: string): string {
  return escapeHtml((value ?? "").slice(0, 10));
}

function deleteCell(u: User, currentUser: User): string {
  if (u.id === currentUser.id)
    return `<span style="opacity:0.4;font-size:var(--font-size-xs)">Tú</span>`;
  return button({
    label: "Eliminar",
    variant: "danger",
    size: "sm",
    type: "button",
    attrs: `hx-delete="/users/${u.id}" hx-target="#users-table" hx-swap="outerHTML" hx-confirm="¿Eliminar a ${escapeHtml(
      u.email
    )}?"`,
  });
}

/** The users table, wrapped so it can be swapped as an HTMX target. */
export function usersTableFragment(users: User[], currentUser: User): string {
  return `<div id="users-table">${table<User>({
    columns: [
      { header: "ID", cell: (u) => String(u.id), width: "56px" },
      { header: "Correo", cell: (u) => escapeHtml(u.email) },
      { header: "Rol", cell: (u) => roleBadge(u.role), width: "150px" },
      { header: "Creado", cell: (u) => fmtDate(u.created_at), width: "120px" },
      {
        header: "",
        cell: (u) => deleteCell(u, currentUser),
        width: "110px",
        align: "right",
      },
    ],
    rows: users,
    empty: "No hay usuarios.",
  })}</div>`;
}

/** Full admin page listing all users. */
export function usersListPage(users: User[], currentUser: User): string {
  const body = `
  ${pageHeader("Usuarios", {
    actions: linkButton({ label: "+ Nuevo usuario", href: "/users/new" }),
  })}
  ${usersTableFragment(users, currentUser)}`;

  return page({
    user: currentUser,
    current: "/users",
    title: "Usuarios",
    body,
  });
}

/** Admin form to create a new user with a role and temporary password. */
export function userNewPage(
  currentUser: User,
  values: { email: string; role: Role } = { email: "", role: "member" },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${textField({
      name: "email",
      label: "Correo",
      type: "email",
      value: values.email,
      required: true,
      autocomplete: "off",
      error: errors.email,
    })}
    ${textField({
      name: "password",
      label: "Contraseña temporal",
      type: "password",
      required: true,
      autocomplete: "new-password",
      attrs: 'minlength="8"',
      error: errors.password,
    })}
    ${selectField({
      name: "role",
      label: "Rol",
      options: ROLE_OPTIONS,
      value: values.role,
      error: errors.role,
    })}
    ${formActions(
      button({ label: "Crear usuario" }),
      linkButton({ label: "Cancelar", href: "/users", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/users", "← Volver a usuarios")}
  ${pageHeader("Nuevo usuario")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/users"' })}`;

  return page({
    user: currentUser,
    current: "/users",
    title: "Nuevo usuario",
    body,
    maxWidth: "560px",
  });
}
