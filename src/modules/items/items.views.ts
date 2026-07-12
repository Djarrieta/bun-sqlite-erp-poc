import type { User } from "../auth/auth.db.ts";
import { HTMX_SCRIPT, escapeHtml, layout } from "../../components/layout.ts";
import { badge, type BadgeVariant } from "../../components/badge.ts";
import { table } from "../../components/table.ts";
import { nav } from "../../components/nav.ts";
import { can } from "../../core/permissions.ts";
import { parseTags, type Item, type ItemStatus } from "./items.db.ts";
import { ITEMS_MODULE, ITEM_STATUSES } from "./items.rules.ts";

const STATUS_VARIANT: Record<ItemStatus, BadgeVariant> = {
  draft: "warning",
  active: "success",
  archived: "neutral",
};

const STATUS_LABEL: Record<ItemStatus, string> = {
  draft: "Borrador",
  active: "Activo",
  archived: "Archivado",
};

interface FormValues {
  name: string;
  tags: string;
  status: ItemStatus;
}

function statusBadge(status: ItemStatus): string {
  return badge(STATUS_LABEL[status] ?? status, STATUS_VARIANT[status] ?? "neutral");
}

function tagChips(tags: string): string {
  const list = parseTags(tags);
  if (list.length === 0) return `<span style="opacity:0.5">—</span>`;
  return list
    .map((t: string) => `<span class="tag-chip">${escapeHtml(t)}</span>`)
    .join(" ");
}

const PAGE_STYLES = `
  .items-head { display:flex; align-items:center; justify-content:space-between; gap:1rem; margin-bottom:1.25rem; }
  .items-head h1 { margin:0; text-align:left; font-size:var(--font-size-lg); }
  .tag-chip { display:inline-block; padding:0.1rem 0.5rem; border-radius:var(--radius); background:color-mix(in srgb, var(--accent) 10%, transparent); font-size:var(--font-size-xs); }
  .card { border:1px solid var(--border); border-radius:var(--radius); padding:1.25rem; }
  .field { display:flex; flex-direction:column; gap:0.35rem; margin-bottom:0.9rem; }
  .field label { font-size:var(--font-size-sm); font-weight:var(--font-weight-medium); }
  .field .err { color:var(--danger); font-size:var(--font-size-xs); }
  select { padding:0.6rem 0.7rem; font-family:inherit; font-size:var(--font-size-base); border:1px solid var(--border); border-radius:var(--radius); background:transparent; color:inherit; }
  .row-actions { display:flex; gap:0.6rem; align-items:center; margin-top:1rem; }
  .btn-secondary { padding:0.6rem 1rem; border:1px solid var(--border); border-radius:var(--radius); background:transparent; color:inherit; text-decoration:none; cursor:pointer; font-size:var(--font-size-base); }
  .btn-danger { padding:0.6rem 1rem; border:1px solid color-mix(in srgb, var(--danger) 40%, transparent); border-radius:var(--radius); background:transparent; color:var(--danger); cursor:pointer; font-size:var(--font-size-base); }
  .saved { color:var(--success); font-size:var(--font-size-sm); }
  .backlink { display:inline-block; margin-bottom:1rem; font-size:var(--font-size-sm); }
  a.primary { display:inline-block; text-decoration:none; }
`;

/** The name/tags/status fields, shared by the create and edit forms. */
function itemFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean
): string {
  const dis = editable ? "" : " disabled";
  const options = ITEM_STATUSES.map(
    (s) =>
      `<option value="${s}"${s === values.status ? " selected" : ""}>${
        STATUS_LABEL[s]
      }</option>`
  ).join("");

  return `
    <div class="field">
      <label for="name">Nombre</label>
      <input id="name" type="text" name="name" value="${escapeHtml(
        values.name
      )}" maxlength="120" autocomplete="off" required${dis} />
      ${errors.name ? `<span class="err">${escapeHtml(errors.name)}</span>` : ""}
    </div>
    <div class="field">
      <label for="tags">Etiquetas <span style="opacity:0.6">(separadas por comas)</span></label>
      <input id="tags" type="text" name="tags" value="${escapeHtml(
        values.tags
      )}" placeholder="ej: urgente, ventas"${dis} />
      ${errors.tags ? `<span class="err">${escapeHtml(errors.tags)}</span>` : ""}
    </div>
    <div class="field">
      <label for="status">Estado</label>
      <select id="status" name="status"${dis}>${options}</select>
      ${
        errors.status
          ? `<span class="err">${escapeHtml(errors.status)}</span>`
          : ""
      }
    </div>`;
}

/** Full list page: a table of the user's items with permission-aware controls. */
export function itemsListPage(items: Item[], user: User): string {
  const newButton = can(user, ITEMS_MODULE, "create")
    ? `<a class="primary" href="/items/new">+ Nuevo</a>`
    : "";

  const body = `
  ${nav(user, "/items")}
  <div class="items-head">
    <h1>Items</h1>
    ${newButton}
  </div>
  ${table<Item>({
    columns: [
      { header: "ID", cell: (it) => String(it.id), width: "64px" },
      { header: "Nombre", cell: (it) => escapeHtml(it.name) },
      { header: "Etiquetas", cell: (it) => tagChips(it.tags) },
      { header: "Estado", cell: (it) => statusBadge(it.status), width: "130px" },
    ],
    rows: items,
    rowHref: (it) => `/items/${it.id}`,
    empty: "No hay items todavía.",
  })}`;

  return layout({
    title: "Items",
    maxWidth: "820px",
    margin: "2.5rem",
    head: HTMX_SCRIPT,
    pageStyles: PAGE_STYLES,
    body,
  });
}

/** Create page with an empty (or error-repopulated) form. */
export function itemNewPage(
  user: User,
  values: FormValues = { name: "", tags: "", status: "draft" },
  errors: Record<string, string> = {}
): string {
  const body = `
  ${nav(user, "/items")}
  <a class="backlink" href="/items">← Volver a items</a>
  <div class="items-head"><h1>Nuevo item</h1></div>
  <form class="card" method="POST" action="/items">
    ${itemFields(values, errors, true)}
    <div class="row-actions">
      <button class="primary" type="submit">Crear</button>
      <a class="btn-secondary" href="/items">Cancelar</a>
    </div>
  </form>`;

  return layout({
    title: "Nuevo item",
    maxWidth: "620px",
    margin: "2.5rem",
    head: HTMX_SCRIPT,
    pageStyles: PAGE_STYLES,
    body,
  });
}

/**
 * The editable detail form. Rendered standalone as an HTMX swap target so that
 * updates re-render just this fragment. Save/delete controls appear only when
 * the user's business rules permit them.
 */
export function itemFormFragment(
  item: Item,
  user: User,
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const canUpdate = can(user, ITEMS_MODULE, "update");
  const canDelete = can(user, ITEMS_MODULE, "delete");
  const values: FormValues = {
    name: item.name,
    tags: parseTags(item.tags).join(", "),
    status: item.status,
  };
  const errors = opts.errors ?? {};

  const saveBtn = canUpdate
    ? `<button class="primary" type="submit">Guardar</button>`
    : "";
  const deleteBtn = canDelete
    ? `<button class="btn-danger" type="button" hx-delete="/items/${item.id}" hx-confirm="¿Eliminar este item?">Eliminar</button>`
    : "";
  const savedMsg = opts.saved ? `<span class="saved">✓ Guardado</span>` : "";
  const readonlyNote = !canUpdate
    ? `<p style="opacity:0.7;font-size:var(--font-size-sm);margin-top:0">Tienes acceso de solo lectura.</p>`
    : "";

  return `<form id="item-form" class="card" hx-put="/items/${item.id}" hx-target="#item-form" hx-swap="outerHTML">
    ${readonlyNote}
    ${itemFields(values, errors, canUpdate)}
    <div class="row-actions">
      ${saveBtn}
      ${deleteBtn}
      ${savedMsg}
    </div>
  </form>`;
}

/** Full detail page wrapping the editable form. */
export function itemDetailPage(item: Item, user: User): string {
  const body = `
  ${nav(user, "/items")}
  <a class="backlink" href="/items">← Volver a items</a>
  <div class="items-head">
    <h1>Item #${item.id}</h1>
    ${statusBadge(item.status)}
  </div>
  ${itemFormFragment(item, user)}`;

  return layout({
    title: `Item #${item.id}`,
    maxWidth: "620px",
    margin: "2.5rem",
    head: HTMX_SCRIPT,
    pageStyles: PAGE_STYLES,
    body,
  });
}
