import type { User } from "../auth/auth.db.ts";
import {
  escapeHtml,
  badge,
  dataTable,
  dataTableBody,
  type DataTableOptions,
  page,
  pageHeader,
  linkButton,
} from "../../components/index.ts";
import type { Page } from "../../core/repository.ts";
import { can } from "../../core/permissions.ts";
import type { InventoryRow } from "./inventory.db.ts";
import { INVENTORY_MODULE } from "./inventory.rules.ts";

/** Search text + location filter that drive the inventory list. */
export interface InventoryFilters {
  q: string;
  /** Location id as a string ("" = any). */
  location: string;
}

/** An option for the location filter dropdown. */
export interface LocationOption {
  value: string;
  label: string;
}

function itemCell(r: InventoryRow): string {
  const flag = r.is_unique ? ` ${badge("Único", "info")}` : "";
  return `<span class="muted">#${r.item_id}</span> ${escapeHtml(r.item_name)}${flag}`;
}

function locationCell(r: InventoryRow): string {
  return `<code>${escapeHtml(r.location_code)}</code> <span class="muted">${escapeHtml(
    r.location_name
  )}</span>`;
}

/** Build a `?q=&location=` query string for export/bookmark links. */
function filterQuery(filters: InventoryFilters): string {
  const sp = new URLSearchParams();
  if (filters.q) sp.set("q", filters.q);
  if (filters.location) sp.set("location", filters.location);
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/**
 * Column + search + filter + pagination config for the inventory list, shared
 * by the full page and the HTMX results fragment so both render identically.
 */
function inventoryTableOptions(
  result: Page<InventoryRow>,
  filters: InventoryFilters,
  locationOptions: LocationOption[] = []
): DataTableOptions<InventoryRow> {
  const anyFilter = !!(filters.q || filters.location);
  return {
    id: "inventory",
    endpoint: "/inventory",
    columns: [
      { header: "Item", cell: itemCell, primary: true },
      { header: "Ubicación", cell: locationCell },
      {
        header: "Cantidad",
        cell: (r) => `<strong>${r.quantity}</strong>`,
        width: "120px",
        numeric: true,
      },
    ],
    rows: result.rows,
    empty: anyFilter
      ? "Ningún saldo coincide con los filtros."
      : "No hay saldos de inventario todavía.",
    search: { value: filters.q, placeholder: "Buscar item o ubicación..." },
    filters: [
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

/** Full list page: a searchable, filterable, paginated table of balances. */
export function inventoryListPage(
  result: Page<InventoryRow>,
  filters: InventoryFilters,
  locationOptions: LocationOption[],
  user: User
): string {
  const actions = can(user, INVENTORY_MODULE, "read")
    ? linkButton({
        label: "Exportar CSV",
        href: `/inventory/export.csv${filterQuery(filters)}`,
        variant: "secondary",
      })
    : "";

  const body = `
  ${pageHeader("Inventario", { eyebrow: "Existencias", actions })}
  ${dataTable(inventoryTableOptions(result, filters, locationOptions))}`;

  return page({
    user,
    current: "/inventory",
    title: "Inventario",
    body,
  });
}

/** The swappable results fragment returned to HTMX search/filter/paging. */
export function inventoryResults(
  result: Page<InventoryRow>,
  filters: InventoryFilters
): string {
  return dataTableBody(inventoryTableOptions(result, filters));
}
