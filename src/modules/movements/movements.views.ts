import type { User } from "../auth/auth.db.ts";
import {
  escapeHtml,
  badge,
  alert,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  table,
  page,
  pageHeader,
  backLink,
  card,
  selectField,
  textareaField,
  formActions,
  button,
  linkButton,
  statusMap,
  savedIndicator,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
import { can } from "../../core/permissions.ts";
import type { Location } from "../locations/locations.db.ts";
import type {
  Movement,
  MovementKind,
  MovementLineRow,
  MovementListRow,
} from "./movements.db.ts";
import {
  MOVEMENTS_MODULE,
  MOVEMENT_KINDS,
  MOVEMENT_STATUSES,
} from "./movements.rules.ts";

const KIND = statusMap<MovementKind>({
  labels: { intake: "Entrada", transfer: "Traslado", dispatch: "Salida" },
  variants: { intake: "success", transfer: "info", dispatch: "warning" },
  order: MOVEMENT_KINDS,
});
const KIND_OPTIONS = KIND.options;

const STATUS = statusMap({
  labels: { draft: "Borrador", confirmed: "Confirmado" },
  variants: { draft: "warning", confirmed: "success" },
  order: MOVEMENT_STATUSES,
});
const STATUS_OPTIONS = STATUS.options;

/** Only movement-specific bits; surfaces/buttons/tables come from base styles. */
const PAGE_STYLES = `
  .movement-summary { display:flex; flex-wrap:wrap; gap:var(--space-2) var(--space-5); margin-bottom:var(--space-4); }
  .movement-summary__item { display:flex; flex-direction:column; gap:2px; }
  .movement-summary__label { font-family:var(--font-mono); font-size:var(--font-size-2xs); letter-spacing:var(--letter-spacing-wide); text-transform:uppercase; color:var(--text-muted); }
  .movement-route code { font-size:var(--font-size-sm); }
  .movement-total { margin-top:var(--space-3); font-size:var(--font-size-sm); color:var(--text-muted); }
  .movement-errors ul { margin:var(--space-1) 0 0; padding-left:var(--space-5); }
  .line-add { display:flex; align-items:center; gap:var(--space-2); padding:var(--space-2) 0; border-bottom:1px solid var(--border-faint); }
  .line-add:last-child { border-bottom:none; }
  .line-add__name { flex:1; min-width:0; }
  .line-add__qty { width:5rem; flex:0 0 auto; }
  .line-add__done { color:var(--text-muted); font-size:var(--font-size-sm); }
  .movement-tools { display:flex; flex-wrap:wrap; gap:var(--space-4); margin-top:var(--space-5); }
  .movement-tools > * { flex:1 1 260px; }
  .movement-import { display:flex; gap:var(--space-2); align-items:center; flex-wrap:wrap; }
`;

/** Human reference derived from the id, e.g. 123 → "MOV-000123". */
export function movementCode(id: number): string {
  return `MOV-${String(id).padStart(6, "0")}`;
}

function kindBadge(kind: MovementKind): string {
  return KIND.badge(kind);
}

function statusBadge(status: string): string {
  return STATUS.badge(status);
}

function code(value: string | null): string {
  return value ? `<code>${escapeHtml(value)}</code>` : `<span class="muted">—</span>`;
}

/** Compact origin→destination display honoring the kind's null side. */
function routeText(
  kind: MovementKind,
  originCode: string | null,
  destCode: string | null
): string {
  if (kind === "intake") return `→ ${code(destCode)}`;
  if (kind === "dispatch") return `${code(originCode)} →`;
  return `${code(originCode)} → ${code(destCode)}`;
}

// --- List -------------------------------------------------------------------

/** Search text + filter selections that drive the movements list. */
export interface MovementFilters {
  q: string;
  kind: string;
  status: string;
  location: string;
}

/** An option for the location filter/select dropdowns. */
export interface LocationOption {
  value: string;
  label: string;
}

function movementsTableOptions(
  result: Page<MovementListRow>,
  filters: MovementFilters,
  locationOptions: LocationOption[] = []
): DataTableOptions<MovementListRow> {
  const anyFilter = !!(
    filters.q ||
    filters.kind ||
    filters.status ||
    filters.location
  );
  return {
    id: "movements",
    endpoint: "/movements",
    columns: [
      {
        header: "Movimiento",
        cell: (m) => `<code>${movementCode(m.id)}</code>`,
        primary: true,
      },
      { header: "Tipo", cell: (m) => kindBadge(m.kind), width: "120px" },
      {
        header: "Ruta",
        cell: (m) =>
          `<span class="movement-route">${routeText(
            m.kind,
            m.origin_code,
            m.destination_code
          )}</span>`,
      },
      {
        header: "Items",
        cell: (m) => String(m.line_count),
        width: "80px",
        align: "right",
      },
      { header: "Estado", cell: (m) => statusBadge(m.status), width: "130px" },
      {
        header: "Fecha",
        cell: (m) => escapeHtml((m.created_at ?? "").slice(0, 10)),
        width: "120px",
      },
    ],
    rows: result.rows,
    rowHref: (m) => `/movements/${m.id}`,
    empty: anyFilter
      ? "Ningún movimiento coincide con los filtros."
      : "No hay movimientos todavía.",
    search: { value: filters.q, placeholder: "Buscar ubicación o nota..." },
    filters: [
      {
        name: "kind",
        label: "Tipo",
        value: filters.kind,
        options: KIND_OPTIONS,
        anyLabel: "Todos",
      },
      {
        name: "status",
        label: "Estado",
        value: filters.status,
        options: STATUS_OPTIONS,
        anyLabel: "Todos",
      },
      {
        name: "location",
        label: "Ubicación",
        value: filters.location,
        options: locationOptions,
        anyLabel: "Todas",
      },
    ],
    pagination: {
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
    },
  };
}

/** Full list page: a searchable, filterable, paginated table of movements. */
export function movementsListPage(
  result: Page<MovementListRow>,
  filters: MovementFilters,
  locationOptions: LocationOption[],
  user: User
): string {
  const actions = can(user, MOVEMENTS_MODULE, "create")
    ? linkButton({ label: "+ Nuevo", href: "/movements/new" })
    : "";

  const body = `
  ${pageHeader("Movimientos", { eyebrow: "Logística", actions })}
  ${dataTable(movementsTableOptions(result, filters, locationOptions))}`;

  return page({ user, current: "/movements", title: "Movimientos", body });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function movementsResults(
  result: Page<MovementListRow>,
  filters: MovementFilters
): string {
  return dataTableBody(movementsTableOptions(result, filters));
}

// --- New --------------------------------------------------------------------

export interface MovementFormValues {
  kind: MovementKind;
  originId: string;
  destinationId: string;
  notes: string;
}

function locationSelect(
  name: string,
  label: string,
  hint: string,
  value: string,
  options: LocationOption[],
  error?: string
): string {
  return selectField({
    name,
    label,
    hint,
    value,
    options: [{ value: "", label: "— Selecciona —" }, ...options],
    error,
  });
}

/** Create page: pick kind + the relevant locations + optional notes. */
export function movementNewPage(
  user: User,
  locationOptions: LocationOption[],
  values: MovementFormValues = {
    kind: "transfer",
    originId: "",
    destinationId: "",
    notes: "",
  },
  errors: Record<string, string> = {}
): string {
  const formBody = `
    ${selectField({
      name: "kind",
      label: "Tipo de movimiento",
      hint: "Entrada (solo destino) · Traslado (origen→destino) · Salida (solo origen)",
      options: KIND_OPTIONS,
      value: values.kind,
      error: errors.kind,
    })}
    ${locationSelect(
      "origin_id",
      "Origen",
      "(traslados y salidas)",
      values.originId,
      locationOptions,
      errors.origin_id
    )}
    ${locationSelect(
      "destination_id",
      "Destino",
      "(entradas y traslados)",
      values.destinationId,
      locationOptions,
      errors.destination_id
    )}
    ${textareaField({
      name: "notes",
      label: "Notas",
      value: values.notes,
      placeholder: "Opcional",
      attrs: 'maxlength="500"',
      error: errors.notes,
    })}
    ${formActions(
      button({ label: "Crear borrador" }),
      linkButton({ label: "Cancelar", href: "/movements", variant: "secondary" })
    )}`;

  const body = `
  ${backLink("/movements", "← Volver a movimientos")}
  ${pageHeader("Nuevo movimiento")}
  ${card(formBody, { as: "form", attrs: 'method="POST" action="/movements"' })}`;

  return page({
    user,
    current: "/movements",
    title: "Nuevo movimiento",
    body,
    maxWidth: "620px",
    pageStyles: PAGE_STYLES,
  });
}

// --- Lines fragment ---------------------------------------------------------

/** Multi-message error banner (e.g. failed confirmation or CSV import). */
function errorsAlert(errors: string[]): string {
  if (errors.length === 0) return "";
  const items = errors.map((e) => `<li>${escapeHtml(e)}</li>`).join("");
  return `<div class="alert alert--error movement-errors"><strong>No se pudo completar:</strong><ul>${items}</ul></div>`;
}

export interface LinesFragmentOptions {
  errors?: string[];
  notice?: string;
}

/**
 * The swappable lines block (`#movement-lines`): an optional banner, the lines
 * table (with per-line delete on drafts) and a totals line. Returned by add /
 * delete / import / failed-confirm so all of them re-render identically.
 */
export function movementLinesFragment(
  movement: Movement,
  lines: MovementLineRow[],
  user: User,
  opts: LinesFragmentOptions = {}
): string {
  const editable = movement.status === "draft" && can(user, MOVEMENTS_MODULE, "update");
  const totalUnits = lines.reduce((sum, l) => sum + l.quantity, 0);

  const columns = [
    {
      header: "Item",
      cell: (l: MovementLineRow) => {
        const flag = l.is_unique ? ` ${badge("Único", "info")}` : "";
        return `<span class="muted">#${l.item_id}</span> ${escapeHtml(l.item_name)}${flag}`;
      },
      primary: true,
    },
    {
      header: "Cantidad",
      cell: (l: MovementLineRow) => `<strong>${l.quantity}</strong>`,
      width: "110px",
      align: "right" as const,
    },
  ];
  if (editable) {
    columns.push({
      header: "",
      cell: (l: MovementLineRow) =>
        button({
          label: "Quitar",
          variant: "danger",
          size: "sm",
          type: "button",
          attrs: `hx-delete="/movements/${movement.id}/lines/${l.id}" hx-target="#movement-lines" hx-swap="outerHTML" hx-confirm="¿Quitar esta línea?"`,
        }),
      width: "100px",
      align: "right" as const,
    });
  }

  const totals =
    lines.length > 0
      ? `<p class="movement-total">${lines.length} línea(s) · ${totalUnits} unidad(es)</p>`
      : "";

  return `<div id="movement-lines">
    ${opts.notice ? alert(opts.notice, "success") : ""}
    ${errorsAlert(opts.errors ?? [])}
    ${table<MovementLineRow>({
      columns,
      rows: lines,
      empty: "Sin líneas todavía.",
    })}
    ${totals}
  </div>`;
}

// --- Line search results ----------------------------------------------------

/** One add-line row (or a "already added" marker) for a search result. */
function lineAddRow(
  movementId: number,
  item: { id: number; name: string; is_unique: number },
  alreadyAdded: boolean
): string {
  const flag = item.is_unique ? ` ${badge("Único", "info")}` : "";
  const nameHtml = `<span class="line-add__name"><span class="muted">#${item.id}</span> ${escapeHtml(
    item.name
  )}${flag}</span>`;

  if (alreadyAdded) {
    return `<div class="line-add">${nameHtml}<span class="line-add__done">✓ Agregado</span></div>`;
  }

  const qtyInput = item.is_unique
    ? `<input class="line-add__qty" type="number" name="quantity" value="1" min="1" max="1" readonly aria-label="Cantidad" />`
    : `<input class="line-add__qty" type="number" name="quantity" value="1" min="1" step="1" aria-label="Cantidad" />`;

  return `<form class="line-add" hx-post="/movements/${movementId}/lines" hx-target="#movement-lines" hx-swap="outerHTML">
    <input type="hidden" name="item_id" value="${item.id}" />
    ${nameHtml}
    ${qtyInput}
    ${button({ label: "Agregar", size: "sm" })}
  </form>`;
}

/**
 * The swappable search-results block (`#line-search-results`) for the item
 * picker. Items already on the movement render as "added" so they can't be
 * inserted twice (which would violate the unique line constraint).
 */
export function lineSearchResults(
  movementId: number,
  items: { id: number; name: string; is_unique: number }[],
  existingItemIds: Set<number>
): string {
  const rows =
    items.length === 0
      ? `<p class="muted">Sin resultados.</p>`
      : items
          .map((it) => lineAddRow(movementId, it, existingItemIds.has(it.id)))
          .join("");
  return `<div id="line-search-results" class="line-search-results">${rows}</div>`;
}

// --- Detail -----------------------------------------------------------------

function summaryItem(label: string, value: string): string {
  return `<div class="movement-summary__item">
    <span class="movement-summary__label">${escapeHtml(label)}</span>
    <span>${value}</span>
  </div>`;
}

/** The read-only header summary (kind, route, notes, dates). */
function movementSummary(
  movement: Movement,
  origin: Location | null,
  destination: Location | null
): string {
  const loc = (l: Location | null): string =>
    l ? `<code>${escapeHtml(l.code)}</code> ${escapeHtml(l.name)}` : `<span class="muted">—</span>`;
  const items: string[] = [summaryItem("Tipo", kindBadge(movement.kind))];
  if (movement.kind !== "intake")
    items.push(summaryItem("Origen", loc(origin)));
  if (movement.kind !== "dispatch")
    items.push(summaryItem("Destino", loc(destination)));
  if (movement.confirmed_at)
    items.push(
      summaryItem("Confirmado", escapeHtml(movement.confirmed_at.slice(0, 16)))
    );
  const notes = movement.notes
    ? `<div class="movement-summary__item" style="flex-basis:100%">
        <span class="movement-summary__label">Notas</span>
        <span>${escapeHtml(movement.notes)}</span>
      </div>`
    : "";
  return `<div class="movement-summary">${items.join("")}${notes}</div>`;
}

/**
 * The `#movement-header` region: a read-only summary for confirmed movements, or
 * an editable form (locations per kind + notes) for drafts. The PUT route
 * returns this same fragment so edits swap in place. Kind is fixed at creation.
 */
export function movementHeaderCard(
  movement: Movement,
  origin: Location | null,
  destination: Location | null,
  locationOptions: LocationOption[],
  user: User,
  opts: { errors?: Record<string, string>; saved?: boolean } = {}
): string {
  const editable =
    movement.status === "draft" && can(user, MOVEMENTS_MODULE, "update");
  if (!editable) {
    return card(movementSummary(movement, origin, destination), {
      attrs: 'id="movement-header"',
    });
  }

  const errors = opts.errors ?? {};
  const originField =
    movement.kind !== "intake"
      ? locationSelect(
          "origin_id",
          "Origen",
          "",
          movement.origin_id ? String(movement.origin_id) : "",
          locationOptions,
          errors.origin_id
        )
      : "";
  const destField =
    movement.kind !== "dispatch"
      ? locationSelect(
          "destination_id",
          "Destino",
          "",
          movement.destination_id ? String(movement.destination_id) : "",
          locationOptions,
          errors.destination_id
        )
      : "";
  const savedMsg = savedIndicator(!!opts.saved);

  const formBody = `
    <div class="movement-summary" style="margin-bottom:var(--space-3)">
      ${summaryItem("Tipo", kindBadge(movement.kind))}
    </div>
    <input type="hidden" name="kind" value="${movement.kind}" />
    ${originField}
    ${destField}
    ${textareaField({
      name: "notes",
      label: "Notas",
      value: movement.notes,
      placeholder: "Opcional",
      attrs: 'maxlength="500"',
      error: errors.notes,
    })}
    ${formActions(button({ label: "Guardar cambios", size: "sm" }), savedMsg)}`;

  return card(formBody, {
    as: "form",
    attrs: `id="movement-header" hx-put="/movements/${movement.id}" hx-target="#movement-header" hx-swap="outerHTML"`,
  });
}

/** The draft-only add-line, import and confirm/delete tools. */
function draftTools(movement: Movement, user: User): string {
  const canUpdate = can(user, MOVEMENTS_MODULE, "update");
  const canCreate = can(user, MOVEMENTS_MODULE, "create");
  const canDelete = can(user, MOVEMENTS_MODULE, "delete");
  if (!canUpdate && !canCreate && !canDelete) return "";

  const picker = canUpdate
    ? card(
        `<h2 class="page-head__title" style="font-size:var(--font-size-lg)">Agregar items</h2>
        <input class="data-search" type="search" name="q" placeholder="Buscar item por id o nombre..."
          autocomplete="off" aria-label="Buscar item"
          hx-get="/movements/${movement.id}/lines/search"
          hx-target="#line-search-results" hx-swap="outerHTML"
          hx-trigger="input changed delay:300ms, search"
          hx-indicator="#line-search-results" />
        ${lineSearchResults(movement.id, [], new Set())}`
      )
    : "";

  const importer = canCreate
    ? card(
        `<h2 class="page-head__title" style="font-size:var(--font-size-lg)">Importar CSV</h2>
        <p class="muted">Formato: <code>item_id;name;quantity</code> (cabecera obligatoria).</p>
        <form class="movement-import" hx-post="/movements/${movement.id}/import"
          hx-target="#movement-lines" hx-swap="outerHTML" hx-encoding="multipart/form-data">
          <input type="file" name="file" accept=".csv,text/csv" required />
          ${button({ label: "Importar", variant: "secondary", size: "sm" })}
        </form>`
      )
    : "";

  const tools =
    picker || importer
      ? `<div class="movement-tools">${picker}${importer}</div>`
      : "";

  const confirmBtn = canUpdate
    ? button({
        label: "Confirmar",
        attrs: `hx-post="/movements/${movement.id}/confirm" hx-target="#movement-lines" hx-swap="outerHTML" hx-confirm="¿Confirmar el movimiento? Aplica el stock y no se puede deshacer."`,
      })
    : "";
  const deleteBtn = canDelete
    ? button({
        label: "Eliminar borrador",
        variant: "danger",
        type: "button",
        attrs: `hx-delete="/movements/${movement.id}" hx-confirm="¿Eliminar este borrador?"`,
      })
    : "";

  return `${tools}${formActions(confirmBtn, deleteBtn)}`;
}

/** Full detail page: header summary, lines, and (for drafts) editing tools. */
export function movementDetailPage(
  movement: Movement,
  origin: Location | null,
  destination: Location | null,
  lines: MovementLineRow[],
  locationOptions: LocationOption[],
  user: User,
  opts: LinesFragmentOptions = {}
): string {
  const headerActions = [
    kindBadge(movement.kind),
    statusBadge(movement.status),
    linkButton({
      label: "Exportar CSV",
      href: `/movements/${movement.id}/export.csv`,
      variant: "secondary",
      size: "sm",
    }),
  ].join(" ");

  const immutableNote =
    movement.status === "confirmed"
      ? alert(
          "Movimiento confirmado (inmutable). Para revertirlo crea un movimiento inverso.",
          "info"
        )
      : "";

  const body = `
  ${backLink("/movements", "← Volver a movimientos")}
  ${pageHeader(movementCode(movement.id), { actions: headerActions })}
  ${immutableNote}
  ${movementHeaderCard(movement, origin, destination, locationOptions, user)}
  ${card(movementLinesFragment(movement, lines, user, opts))}
  ${draftTools(movement, user)}`;

  return page({
    user,
    current: "/movements",
    title: movementCode(movement.id),
    body,
    pageStyles: PAGE_STYLES,
  });
}
