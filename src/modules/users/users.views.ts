import type { User } from "../auth/auth.db.ts";
import { HTMX_SCRIPT, escapeHtml, layout } from "../../components/layout.ts";
import { badge, type BadgeVariant } from "../../components/badge.ts";
import { table } from "../../components/table.ts";
import { nav } from "../../components/nav.ts";
import type { Role } from "../../core/permissions.ts";
import { USER_ROLES } from "./users.rules.ts";

const ROLE_VARIANT: Record<string, BadgeVariant> = {
  admin: "info",
  member: "neutral",
};
const ROLE_LABEL: Record<string, string> = {
  admin: "Administrador",
  member: "Miembro",
};

function roleBadge(role: string): string {
  return badge(ROLE_LABEL[role] ?? role, ROLE_VARIANT[role] ?? "neutral");
}

function fmtDate(value: string): string {
  return escapeHtml((value ?? "").slice(0, 10));
}

const PAGE_STYLES = `
  .users-head { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1.25rem; }
  .users-head h1 { margin:0; text-align:left; font-size:var(--font-size-lg); }
  a.primary { display:inline-block; text-decoration:none; }
  .card { border:1px solid var(--border); border-radius:var(--radius); padding:1.25rem; }
  .field { display:flex; flex-direction:column; gap:0.35rem; margin-bottom:0.9rem; }
  .field label { font-size:var(--font-size-sm); font-weight:var(--font-weight-medium); }
  .field .err { color:var(--danger); font-size:var(--font-size-xs); }
  select { padding:0.6rem 0.7rem; font-family:inherit; font-size:var(--font-size-base); border:1px solid var(--border); border-radius:var(--radius); background:transparent; color:inherit; }
  .row-actions { display:flex; gap:0.6rem; align-items:center; margin-top:1rem; }
  .btn-secondary { padding:0.6rem 1rem; border:1px solid var(--border); border-radius:var(--radius); background:transparent; color:inherit; text-decoration:none; cursor:pointer; font-size:var(--font-size-base); }
  .btn-danger-sm { padding:0.35rem 0.7rem; border:1px solid color-mix(in srgb, var(--danger) 40%, transparent); border-radius:var(--radius); background:transparent; color:var(--danger); cursor:pointer; font-size:var(--font-size-xs); }
  .backlink { display:inline-block; margin-bottom:1rem; font-size:var(--font-size-sm); }
`;

function deleteCell(u: User, currentUser: User): string {
  if (u.id === currentUser.id)
    return `<span style="opacity:0.4;font-size:var(--font-size-xs)">Tú</span>`;
  return `<button class="btn-danger-sm"
    hx-delete="/users/${u.id}"
    hx-target="#users-table"
    hx-swap="outerHTML"
    hx-confirm="¿Eliminar a ${escapeHtml(u.email)}?">Eliminar</button>`;
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
  ${nav(currentUser, "/users")}
  <div class="users-head">
    <h1>Usuarios</h1>
    <a class="primary" href="/users/new">+ Nuevo usuario</a>
  </div>
  ${usersTableFragment(users, currentUser)}`;

  return layout({
    title: "Usuarios",
    maxWidth: "820px",
    margin: "2.5rem",
    head: HTMX_SCRIPT,
    pageStyles: PAGE_STYLES,
    body,
  });
}

/** Admin form to create a new user with a role and temporary password. */
export function userNewPage(
  currentUser: User,
  values: { email: string; role: Role } = { email: "", role: "member" },
  errors: Record<string, string> = {}
): string {
  const roleOptions = USER_ROLES.map(
    (r) =>
      `<option value="${r}"${r === values.role ? " selected" : ""}>${
        ROLE_LABEL[r]
      }</option>`
  ).join("");

  const body = `
  ${nav(currentUser, "/users")}
  <a class="backlink" href="/users">← Volver a usuarios</a>
  <div class="users-head"><h1>Nuevo usuario</h1></div>
  <form class="card" method="POST" action="/users">
    <div class="field">
      <label for="email">Correo</label>
      <input id="email" type="email" name="email" value="${escapeHtml(
        values.email
      )}" autocomplete="off" required />
      ${errors.email ? `<span class="err">${escapeHtml(errors.email)}</span>` : ""}
    </div>
    <div class="field">
      <label for="password">Contraseña temporal</label>
      <input id="password" type="password" name="password" autocomplete="new-password" minlength="8" required />
      ${
        errors.password
          ? `<span class="err">${escapeHtml(errors.password)}</span>`
          : ""
      }
    </div>
    <div class="field">
      <label for="role">Rol</label>
      <select id="role" name="role">${roleOptions}</select>
      ${errors.role ? `<span class="err">${escapeHtml(errors.role)}</span>` : ""}
    </div>
    <div class="row-actions">
      <button class="primary" type="submit">Crear usuario</button>
      <a class="btn-secondary" href="/users">Cancelar</a>
    </div>
  </form>`;

  return layout({
    title: "Nuevo usuario",
    maxWidth: "560px",
    margin: "2.5rem",
    head: HTMX_SCRIPT,
    pageStyles: PAGE_STYLES,
    body,
  });
}
