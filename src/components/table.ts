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
  /** Placeholder text. Defaults to `"Buscar…"`. */
  placeholder?: string;
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
  pagination?: DataTablePagination;
}

/** Build a `?a=b&c=d` string, dropping empty/undefined values. */
function buildQuery(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === "") continue;
    sp.set(k, String(v));
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
    const href = `${opts.endpoint}${buildQuery({
      [searchParam]: q,
      [pageParam]: target,
    })}`;
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

/**
 * A full, reusable list surface: an optional search header, a responsive table,
 * and a pagination footer, all wired for HTMX. Searching and paging replace
 * only the inner results (`#<id>-results`) and push the URL, so state is
 * bookmarkable; the search box lives outside that region so it keeps focus
 * while you type. Pair it with a repository `paginate(...)` query and an
 * endpoint that returns `dataTableBody(...)` for `HX-Request`s.
 */
export function dataTable<T>(opts: DataTableOptions<T>): string {
  const resultsId = `${opts.id ?? "data"}-results`;
  const searchParam = opts.search?.param ?? "q";
  const placeholder = opts.search?.placeholder ?? "Buscar…";

  const toolbar = opts.search
    ? `<div class="data-toolbar">
      <input class="data-search" type="search" name="${escapeHtml(searchParam)}"
        value="${escapeHtml(opts.search.value ?? "")}"
        placeholder="${escapeHtml(placeholder)}"
        autocomplete="off" aria-label="${escapeHtml(placeholder)}"
        hx-get="${opts.endpoint}"
        hx-trigger="input changed delay:300ms, search"
        hx-target="#${resultsId}" hx-swap="outerHTML"
        hx-push-url="true" hx-indicator="#${resultsId}" />
    </div>`
    : "";

  return `<div class="data-region">${toolbar}${dataTableBody(opts)}</div>`;
}
