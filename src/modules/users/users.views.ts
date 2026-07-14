import type { User } from "../auth/auth.db.ts";
import {
  escapeHtml,
  table,
  page,
  pageHeader,
  backLink,
  card,
  textField,
  selectField,
  formActions,
  button,
  linkButton,
  alert,
  statusMap,
} from "../../components/index.ts";
import { formatDate } from "../../core/dates.ts";
import type { Role } from "../../core/permissions.ts";
import { USER_ROLES } from "./users.rules.ts";

const ROLE = statusMap<Role>({
  labels: {
    admin: "Administrador",
    sales: "Ventas",
    financial: "Finanzas",
    engineer: "Ingeniería",
    logistic: "Logística",
    member: "Miembro",
  },
  variants: {
    admin: "info",
    sales: "success",
    financial: "warning",
    engineer: "neutral",
    logistic: "danger",
    member: "neutral",
  },
  order: USER_ROLES,
});

const ROLE_OPTIONS = ROLE.options;

function roleBadge(role: string): string {
  return ROLE.badge(role);
}

function deleteCell(u: User, currentUser: User): string {
  const resetPassword = linkButton({
    label: "Contraseña",
    href: `/users/${u.id}/password`,
    variant: "secondary",
    size: "sm",
  });
  const remove =
    u.id === currentUser.id
      ? `<span style="opacity:0.4;font-size:var(--font-size-xs)">Tú</span>`
      : button({
          label: "Eliminar",
          variant: "danger",
          size: "sm",
          type: "button",
          attrs: `hx-delete="/users/${u.id}" hx-target="#users-table" hx-swap="outerHTML" hx-confirm="¿Eliminar a ${escapeHtml(
            u.email
          )}?"`,
        });
  return `<div style="display:flex;gap:var(--space-2);justify-content:flex-end">${resetPassword}${remove}</div>`;
}

/** The users table, wrapped so it can be swapped as an HTMX target. */
export function usersTableFragment(users: User[], currentUser: User): string {
  return `<div id="users-table">${table<User>({
    columns: [
      { header: "ID", cell: (u) => String(u.id), width: "56px" },
      { header: "Correo", cell: (u) => escapeHtml(u.email) },
      { header: "Rol", cell: (u) => roleBadge(u.role), width: "150px" },
      { header: "Creado", cell: (u) => formatDate(u.created_at), width: "120px" },
      {
        header: "",
        cell: (u) => deleteCell(u, currentUser),
        width: "210px",
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
    eyebrow: "Administración",
    actions: linkButton({ label: "+ Nuevo usuario", href: "/users/new" }),
  })}
  ${card(usersTableFragment(users, currentUser), { class: "card--flush" })}`;

  return page({
    user: currentUser,
    current: "/users",
    title: "Usuarios",
    body,
  });
}

/**
 * Read-only, auto-generated temporary password with a copy-to-clipboard button.
 * The value is generated server-side so the admin can only copy it, never edit
 * it. It still submits as `name="password"` with the rest of the form.
 */
function generatedPasswordField(password: string): string {
  return `<div class="field">
    <label class="field__label" for="password">Contraseña temporal <span class="field__hint">generada automáticamente</span></label>
    <div style="display:flex;gap:var(--space-2);align-items:stretch">
      <input id="password" name="password" type="text" value="${escapeHtml(
        password
      )}" readonly style="flex:1;font-family:var(--font-mono)" />
      ${button({
        label: "Copiar",
        variant: "secondary",
        type: "button",
        attrs:
          "onclick=\"navigator.clipboard.writeText(document.getElementById('password').value);this.textContent='Copiado'\"",
      })}
    </div>
    <span class="field__hint">Cópiala y compártela con el usuario; podrás restablecerla luego si se pierde.</span>
  </div>`;
}

/** Admin form to create a new user with a role and auto-generated password. */
export function userNewPage(
  currentUser: User,
  values: { email: string; role: Role; password: string } = {
    email: "",
    role: "member",
    password: "",
  },
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
    ${generatedPasswordField(values.password)}
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

/** Admin form to set a temporary password for an existing user. */
export function userPasswordPage(
  currentUser: User,
  target: User,
  password: string,
  opts: { error?: string; success?: boolean } = {}
): string {
  // Single CTA flow: one click generates a password (client-side, so the click
  // stays a user gesture for the clipboard), copies it, and submits the form so
  // the server saves exactly that value. Only two buttons remain: the CTA and
  // "Volver".
  const formBody = `
    ${
      opts.success
        ? alert("Contraseña actualizada y copiada al portapapeles.", "success")
        : ""
    }
    ${alert(opts.error ?? "", "error")}
    <div class="field">
      <label class="field__label" for="password">Contraseña temporal <span class="field__hint">generada automáticamente</span></label>
      <input id="password" name="password" type="text" value="${escapeHtml(
        password
      )}" readonly placeholder="Pulsa el botón para generarla" style="font-family:var(--font-mono)" />
      <span class="field__hint">Se genera, se guarda y se copia al portapapeles con un solo clic.</span>
    </div>
    ${formActions(
      button({
        label: "Generar y copiar contraseña",
        type: "button",
        attrs: 'onclick="resetPassword(this)"',
      }),
      linkButton({ label: "Volver", href: "/users", variant: "secondary" })
    )}
    <script>
    function resetPassword(btn){
      var input=document.getElementById('password');
      var a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
      var b=new Uint8Array(14);crypto.getRandomValues(b);
      var p='';for(var i=0;i<b.length;i++)p+=a.charAt(b[i]%a.length);
      input.value=p;
      var submit=function(){btn.form.submit();};
      if(navigator.clipboard&&navigator.clipboard.writeText){
        navigator.clipboard.writeText(p).then(submit,submit);
      }else{submit();}
    }
    </script>`;

  const body = `
  ${backLink("/users", "← Volver a usuarios")}
  ${pageHeader("Restablecer contraseña", {
    eyebrow: "Administración",
    subtitle: `${escapeHtml(target.email)} · ${escapeHtml(target.role)}`,
  })}
  ${card(formBody, {
    as: "form",
    attrs: `method="POST" action="/users/${target.id}/password"`,
  })}`;

  return page({
    user: currentUser,
    current: "/users",
    title: "Restablecer contraseña",
    body,
    maxWidth: "560px",
  });
}
