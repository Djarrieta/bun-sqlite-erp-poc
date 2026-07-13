import type { User } from "../auth/auth.db.ts";
import {
  escapeHtml,
  badge,
  type BadgeVariant,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  page,
  pageHeader,
  backLink,
  card,
  textField,
  selectField,
  formActions,
  button,
  linkButton,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
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

const STATUS_OPTIONS = ITEM_STATUSES.map((s) => ({
  value: s,
  label: STATUS_LABEL[s],
}));

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

/** Only item-specific bits; surfaces, controls and buttons come from the base styles. */
const PAGE_STYLES = `
  .tag-chip { display:inline-block; padding:var(--space-1) var(--space-2); border-radius:var(--radius); background:color-mix(in srgb, var(--accent) 10%, transparent); font-size:var(--font-size-xs); }
  .saved { color:var(--success); font-size:var(--font-size-sm); }
`;

/** The name/tags/status fields, shared by the create and edit forms. */
function itemFields(
  values: FormValues,
  errors: Record<string, string>,
  editable: boolean
): string {
  return `
    ${textField({
      name: "name",
      label: "Nombre",
      value: values.name,
      required: true,
      disabled: !editable,
      autocomplete: "off",
      attrs: 'maxlength="120"',
      error: errors.name,
    })}
    ${textField({
      name: "tags",
      label: "Etiquetas",
      hint: "(separadas por comas)",
      value: values.tags,
      placeholder: "ej: urgente, ventas",
      disabled: !editable,
      error: errors.tags,
    })}
    ${selectField({
      name: "status",
      label: "Estado",
      options: STATUS_OPTIONS,
      value: values.status,
      disabled: !editable,
      error: errors.status,
    })}`;
}

/**
 * Column + search + pagination config for the items list, shared by the full
 * page and the HTMX results fragment so both render identically.
 */
function itemsTableOptions(result: Page<Item>, q: string): DataTableOptions<Item> {
  return {
    id: "items",
    endpoint: "/items",
    columns: [
      { header: "ID", cell: (it) => String(it.id), width: "64px" },
      { header: "Nombre", cell: (it) => escapeHtml(it.name), primary: true },
      { header: "Etiquetas", cell: (it) => tagChips(it.tags) },
      { header: "Estado", cell: (it) => statusBadge(it.status), width: "130px" },
    ],
    rows: result.rows,
    rowHref: (it) => `/items/${it.id}`,
    empty: q
      ? "Ningún item coincide con tu búsqueda."
      : "No hay items todavía.",
    search: { value: q, placeholder: "Buscar por nombre o etiqueta…" },
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: a searchable, paginated table of the user's items. */
export function itemsListPage(result: Page<Item>, q: string, user: User): string {
  const actions = can(user, ITEMS_MODULE, "create")
    ? linkButton({ label: "+ Nuevo", href: "/items/new" })
    : "";

  const body = `
  ${pageHeader("Items", { eyebrow: "Catálogo", actions })}
  ${dataTable(itemsTableOptions(result, q))}`;

  return page({
    user,
    current: "/items",
    title: "Items",
    body,
    pageStyles: PAGE_STYLES,
  });
}

/** The swappable results fragment returned to HTMX search/paging requests. */
export function itemsResults(result: Page<Item>, q: string): string {
  return dataTableBody(itemsTableOptions(result, q));
}

/** Create page with an empty (or error-repopulated) form. */
export function itemNewPage(
  user: User,
  values: FormValues = { name: "", tags: "", status: "draft" },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${itemFields(values, errors, true)}
    ${formActions(
      button({ label: "Crear" }),
      linkButton({ label: "Cancelar", href: "/items", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/items", "← Volver a items")}
  ${pageHeader("Nuevo item")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/items"' })}`;

  return page({
    user,
    current: "/items",
    title: "Nuevo item",
    body,
    maxWidth: "620px",
    pageStyles: PAGE_STYLES,
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

  const saveBtn = canUpdate ? button({ label: "Guardar" }) : "";
  const deleteBtn = canDelete
    ? button({
        label: "Eliminar",
        variant: "danger",
        type: "button",
        attrs: `hx-delete="/items/${item.id}" hx-confirm="¿Eliminar este item?"`,
      })
    : "";
  const savedMsg = opts.saved ? `<span class="saved">✓ Guardado</span>` : "";
  const readonlyNote = !canUpdate
    ? `<p class="muted">Tienes acceso de solo lectura.</p>`
    : "";

  const formBody = `
    ${readonlyNote}
    ${itemFields(values, errors, canUpdate)}
    ${formActions(saveBtn, deleteBtn, savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="item-form" hx-put="/items/${item.id}" hx-target="#item-form" hx-swap="outerHTML"`,
  });
}

/** Full detail page wrapping the editable form. */
export function itemDetailPage(item: Item, user: User): string {
  const body = `
  ${backLink("/items", "← Volver a items")}
  ${pageHeader(`Item #${item.id}`, { actions: statusBadge(item.status) })}
  ${itemFormFragment(item, user)}`;

  return page({
    user,
    current: "/items",
    title: `Item #${item.id}`,
    body,
    maxWidth: "620px",
    pageStyles: PAGE_STYLES,
  });
}
