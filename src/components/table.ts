/**
 * Generic, reusable data table. Modules describe their columns and rows; the
 * component handles markup, empty state, and optional clickable rows.
 *
 * On narrow screens the table collapses into one stacked card per row (each
 * cell becomes a `label: value` line via `data-label`), so the same call works
 * on desktop and mobile. Styles live in `layout.ts`.
 *
 * For lists that need search + pagination over many rows, use `dataTable`
 * (below), which wraps this table in an HTMX-driven search/paging surface.
 */
import { escapeHtml } from "./layout.ts";

export interface Column<T> {
  header: string;
  /** Returns ready-to-render HTML for the cell (escape user data yourself). */
  cell: (row: T) => string;
  align?: "left" | "center" | "right";
  width?: string;
  /**
   * Marks the row's headline column. On mobile its value becomes the card
   * title (shown larger, without a label). Use it for the name/title column.
   */
  primary?: boolean;
}

export interface TableOptions<T> {
  columns: Column<T>[];
  rows: T[];
  /** Optional per-row destination URL; makes the whole row clickable. */
  rowHref?: (row: T) => string;
  /** Message shown when there are no rows. */
  empty?: string;
  id?: string;
}

export function table<T>(opts: TableOptions<T>): string {
  const { columns, rows, rowHref, empty = "No hay registros.", id } = opts;

  const head = columns
    .map(
      (c) =>
        `<th style="text-align:${c.align ?? "left"}${
          c.width ? `;width:${c.width}` : ""
        }">${c.header}</th>`
    )
    .join("");

  const body =
    rows.length === 0
      ? `<tr><td class="data-table__empty" colspan="${columns.length}">${empty}</td></tr>`
      : rows
          .map((row) => {
            const cells = columns
              .map((c) => {
                const cls = c.primary ? ' class="data-cell--primary"' : "";
                return `<td${cls} data-label="${escapeHtml(
                  c.header
                )}" style="text-align:${c.align ?? "left"}">${c.cell(row)}</td>`;
              })
              .join("");
            const href = rowHref?.(row);
            const attrs = href
              ? ` class="data-table__row data-table__row--link" onclick="location.href='${href}'"`
              : ` class="data-table__row"`;
            return `<tr${attrs}>${cells}</tr>`;
          })
          .join("");

  return `<div class="data-table-wrap">
    <table class="data-table"${id ? ` id="${id}"` : ""}>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}

/** Search-box configuration for `dataTable`. Omit to hide the search header. */
export interface DataTableSearch {
  /** Current query value, echoed back into the box. */
  value?: string;
  /** Query-string param name. Defaults to `"q"`. */
  param?: string;
  /** Placeholder text. Defaults to `"Buscar..."`. */
  placeholder?: string;
}

/** A filter shown in the `dataTable` filter panel (dropdown or chip group). */
export interface DataTableFilter {
  /**
   * Query-string param name, e.g. `"status"`. Becomes a form-field and URL
   * param name, so it must be a trusted, developer-supplied constant.
   */
  name: string;
  /** Label shown above the control in the panel. */
  label: string;
  /** Selectable options. Single-select prepends a blank "any" option. */
  options: { value: string; label: string }[];
  /** Single-select current value, echoed back. Empty string means "any". */
  value?: string;
  /** Label for the blank "any" option (single-select). Defaults to `"Todos"`. */
  anyLabel?: string;
  /** Render as a multi-select chip group (checkboxes) instead of a dropdown. */
  multiple?: boolean;
  /** Multi-select current values (used when `multiple` is true). */
  values?: string[];
}

/** Pagination state for `dataTable`. Omit to hide the pagination footer. */
export interface DataTablePagination {
  /** 1-based current page. */
  page: number;
  pageSize: number;
  /** Total rows across every page, after filtering. */
  total: number;
  /** Query-string param name. Defaults to `"page"`. */
  param?: string;
}

export interface DataTableOptions<T> extends TableOptions<T> {
  /**
   * Base endpoint that returns the results fragment (`dataTableBody`) for
   * search + pagination, e.g. `"/items"`. Must be a trusted, developer-supplied
   * path — it is interpolated into `hx-get`.
   */
  endpoint: string;
  search?: DataTableSearch;
  /** Dropdown filters shown in a panel behind a filter (funnel) icon. */
  filters?: DataTableFilter[];
  pagination?: DataTablePagination;
}

/** Build a `?a=b&c=d` string, dropping empties; array values repeat the key. */
function buildQuery(
  params: Record<string, string | number | string[] | undefined>
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    if (Array.isArray(v)) {
      for (const item of v) if (item !== "") sp.append(k, item);
    } else {
      sp.set(k, String(v));
    }
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

/** The pagination footer: a "from–to of total" label and prev/next controls. */
function paginationBar<T>(resultsId: string, opts: DataTableOptions<T>): string {
  const p = opts.pagination;
  if (!p) return "";
  const pageParam = p.param ?? "page";
  const searchParam = opts.search?.param ?? "q";
  const q = opts.search?.value ?? "";
  const totalPages = Math.max(1, Math.ceil(p.total / p.pageSize));
  const page = Math.min(Math.max(1, p.page), totalPages);
  const from = p.total === 0 ? 0 : (page - 1) * p.pageSize + 1;
  const to = Math.min(page * p.pageSize, p.total);

  const control = (target: number, label: string, disabled: boolean): string => {
    if (disabled) {
      return `<button class="btn btn--secondary btn--sm" type="button" disabled aria-disabled="true">${label}</button>`;
    }
    const params: Record<string, string | number | string[] | undefined> = {
      [searchParam]: q,
    };
    // Carry active filters across page changes (blank values are dropped).
    for (const f of opts.filters ?? []) {
      params[f.name] = f.multiple ? f.values ?? [] : f.value ?? "";
    }
    params[pageParam] = target;
    const href = `${opts.endpoint}${buildQuery(params)}`;
    return `<button class="btn btn--secondary btn--sm" type="button" hx-get="${href}" hx-target="#${resultsId}" hx-swap="outerHTML" hx-push-url="true" hx-indicator="#${resultsId}">${label}</button>`;
  };

  return `<nav class="data-pagination" aria-label="Paginación">
    <span class="data-pagination__info">${from}–${to} de ${p.total}</span>
    <div class="data-pagination__controls">
      ${control(page - 1, "← Anterior", page <= 1)}
      <span class="data-pagination__page">Página ${page} de ${totalPages}</span>
      ${control(page + 1, "Siguiente →", page >= totalPages)}
    </div>
  </nav>`;
}

/**
 * The swappable inner results of a `dataTable`: the table plus its pagination
 * footer, wrapped in `#<id>-results`. Return this (not the whole `dataTable`)
 * from your list endpoint when the request is an HTMX request (`HX-Request`
 * header), so search/paging replaces only the results and the search box keeps
 * focus.
 */
export function dataTableBody<T>(opts: DataTableOptions<T>): string {
  const resultsId = `${opts.id ?? "data"}-results`;
  return `<div id="${resultsId}" class="data-results">${table<T>(
    opts
  )}${paginationBar(resultsId, opts)}</div>`;
}

/** Feather "filter" (funnel) icon used on the filter toggle. */
const FILTER_ICON = `<svg class="data-filter__icon" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon></svg>`;

/** Whether a filter currently narrows results (a value set or any chip on). */
function filterActive(f: DataTableFilter): boolean {
  return f.multiple ? (f.values?.length ?? 0) > 0 : (f.value ?? "") !== "";
}

/** A single-select dropdown filter with a blank "any" option. */
function singleFilter(f: DataTableFilter): string {
  const options = [
    `<option value="">${escapeHtml(f.anyLabel ?? "Todos")}</option>`,
    ...f.options.map(
      (o) =>
        `<option value="${escapeHtml(o.value)}"${
          o.value === (f.value ?? "") ? " selected" : ""
        }>${escapeHtml(o.label)}</option>`
    ),
  ].join("");
  return `<div class="field">
    <label class="field__label" for="filter-${escapeHtml(f.name)}">${escapeHtml(
    f.label
  )}</label>
    <select id="filter-${escapeHtml(f.name)}" name="${escapeHtml(
    f.name
  )}">${options}</select>
  </div>`;
}

/** A multi-select filter rendered as a group of toggle chips (checkboxes). */
function multiFilter(f: DataTableFilter): string {
  const selected = new Set(f.values ?? []);
  const chips = f.options.length
    ? f.options
        .map(
          (o) =>
            `<label class="data-chip">
        <input type="checkbox" name="${escapeHtml(f.name)}" value="${escapeHtml(
              o.value
            )}"${selected.has(o.value) ? " checked" : ""} />
        <span>${escapeHtml(o.label)}</span>
      </label>`
        )
        .join("")
    : `<span class="muted">Sin opciones</span>`;
  return `<fieldset class="data-filter__group">
    <legend class="field__label">${escapeHtml(f.label)}</legend>
    <div class="data-chips">${chips}</div>
  </fieldset>`;
}

/** The filter icon plus a disclosure panel holding one control per filter. */
function filtersPanel(filters: DataTableFilter[]): string {
  const active = filters.filter(filterActive).length;
  const count = active ? `<span class="data-filter__count">${active}</span>` : "";
  const fields = filters
    .map((f) => (f.multiple ? multiFilter(f) : singleFilter(f)))
    .join("");
  return `<details class="data-filter">
    <summary class="data-filter__toggle btn btn--secondary" title="Filtros" aria-label="Filtros">
      ${FILTER_ICON}<span class="data-filter__label">Filtros</span>${count}
    </summary>
    <div class="data-filter__panel" role="group" aria-label="Filtros">${fields}</div>
  </details>`;
}

/**
 * A full, reusable list surface: an optional search box and filter panel, a
 * responsive table, and a pagination footer, all wired for HTMX. Searching,
 * filtering and paging replace only the inner results (`#<id>-results`) and
 * push the URL, so state is bookmarkable; the search box and filters live in a
 * form outside that region so they keep their values (and focus) across swaps.
 * Pair it with a repository `paginate(...)` query and an endpoint that returns
 * `dataTableBody(...)` for `HX-Request`s.
 */
export function dataTable<T>(opts: DataTableOptions<T>): string {
  const resultsId = `${opts.id ?? "data"}-results`;
  const searchParam = opts.search?.param ?? "q";
  const placeholder = opts.search?.placeholder ?? "Buscar...";
  const filters = opts.filters ?? [];

  const searchInput = opts.search
    ? `<input class="data-search" type="search" name="${escapeHtml(searchParam)}"
        value="${escapeHtml(opts.search.value ?? "")}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off" aria-label="${escapeHtml(placeholder)}" />`
    : "";

  // One form wraps search + filters so a change serializes them together (no
  // duplicate params). `onsubmit` is neutralized because HTMX drives requests
  // from field events, not a native submit.
  const toolbar =
    opts.search || filters.length
      ? `<form class="data-toolbar" onsubmit="return false"
          hx-get="${opts.endpoint}" hx-target="#${resultsId}" hx-swap="outerHTML"
          hx-push-url="true" hx-indicator="#${resultsId}"
          hx-trigger="input changed delay:300ms from:input[name='${escapeHtml(
            searchParam
          )}'], search from:input[name='${escapeHtml(
          searchParam
        )}'], change from:select, change from:input[type='checkbox']">
          ${searchInput}
          ${filters.length ? filtersPanel(filters) : ""}
        </form>`
      : "";

  return `<div class="data-region">${toolbar}${dataTableBody(opts)}</div>`;
}
