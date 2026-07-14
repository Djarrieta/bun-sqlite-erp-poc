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
import { filterPanel, type FilterDef } from "./filter.ts";

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
  /**
   * Marks a numeric/figure column: right-aligns it and renders the value in the
   * mono "ledger" face with tabular figures. Overrides `align`.
   */
  numeric?: boolean;
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

  // Numeric columns are right-aligned like a ledger; otherwise honor `align`.
  const alignOf = (c: Column<T>): "left" | "center" | "right" =>
    c.numeric ? "right" : c.align ?? "left";

  const head = columns
    .map(
      (c) =>
        `<th style="text-align:${alignOf(c)}${
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
                const cls = [
                  c.primary ? "data-cell--primary" : "",
                  c.numeric ? "data-cell--num" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                const clsAttr = cls ? ` class="${cls}"` : "";
                return `<td${clsAttr} data-label="${escapeHtml(
                  c.header
                )}" style="text-align:${alignOf(c)}">${c.cell(row)}</td>`;
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

/**
 * The filters a `dataTable` shows in its panel — the shared {@link FilterDef}.
 * See `filter.ts` for `filterPanel()`, the standalone panel usable on its own.
 */
export type DataTableFilter = FilterDef;

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
  /** Filters shown in a panel behind a filter (funnel) icon; each is a single-select dropdown or a multi-select chip group. */
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
          ${filters.length ? filterPanel(filters) : ""}
        </form>`
      : "";

  return `<div class="data-region">${toolbar}${dataTableBody(opts)}</div>`;
}

/**
 * Data-table styles (surface, search header, table, pagination, and the
 * mobile row-to-card transform), aggregated into the global stylesheet by
 * `layout.ts` so HTMX result fragments — which ship no <style> — stay styled.
 */
export const tableStyles = `
    .data-region { border: 1px solid var(--border); border-radius: var(--radius-lg); background: var(--surface); box-shadow: var(--shadow-sm); overflow: hidden; }
    /* Let the open filter panel escape the surface's rounded clip. */
    .data-region:has(.data-filter[open]) { overflow: visible; }
    .data-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--space-2); padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border); }
    .data-search { flex: 1; min-width: 0; }
    .data-results { display: block; }
    .data-results.htmx-request { opacity: 0.55; transition: opacity 0.12s ease; }

    .data-table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
    .data-table { width: 100%; border-collapse: collapse; font-size: var(--font-size-sm); }
    .data-table th, .data-table td { padding: var(--space-3) var(--space-4); border-bottom: 1px solid var(--border-faint); white-space: nowrap; text-align: left; }
    .data-table thead th { background: var(--surface-sunken); text-transform: uppercase; letter-spacing: var(--letter-spacing-wide); font-family: var(--font-mono); font-size: var(--font-size-2xs); color: var(--text-muted); font-weight: var(--font-weight-medium); border-bottom: 1px solid var(--border); }
    .data-table tbody td { font-variant-numeric: tabular-nums; }
    .data-table tbody tr:last-child td { border-bottom: none; }
    .data-table__row--link { cursor: pointer; }
    .data-table__row--link:hover { background: var(--surface-sunken); }
    .data-table__empty { text-align: center; padding: var(--space-6) 0; color: var(--text-muted); white-space: normal; }
    /* Numeric/figure cells: the mono ledger face with tabular figures. */
    .data-cell--num { font-family: var(--font-mono); font-variant-numeric: tabular-nums; font-size: var(--font-size-xs); color: var(--text); }

    .data-pagination { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--space-3); padding: var(--space-3) var(--space-4); border-top: 1px solid var(--border); }
    .data-pagination__info { color: var(--text-muted); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }
    .data-pagination__controls { display: flex; align-items: center; gap: var(--space-2); }
    .data-pagination__page { color: var(--text-muted); font-size: var(--font-size-xs); font-variant-numeric: tabular-nums; }

    /* Small screens: drop the outer surface chrome and let each row collapse
       into its own stacked card of label/value pairs (the app's primary,
       mobile-optimized list view). */
    @media (max-width: 860px) {
      .data-region { border: none; border-radius: 0; background: transparent; box-shadow: none; overflow: visible; }
      .data-toolbar { padding: 0 0 var(--space-2); border-bottom: none; }
      .data-pagination { padding: var(--space-4) 0 0; border-top: none; }

      .data-table-wrap { overflow-x: visible; }
      .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
      .data-table thead { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); border: 0; }
      .data-table tr { border: 1px solid var(--border); border-radius: var(--radius); background: var(--surface); box-shadow: var(--shadow-sm); padding: var(--space-2) var(--space-3); margin-bottom: var(--space-3); }
      .data-table td { display: flex; align-items: baseline; justify-content: space-between; gap: var(--space-4); padding: var(--space-2) 0; border-bottom: 1px solid var(--border-faint); white-space: normal; text-align: right; }
      .data-table td:last-child { border-bottom: none; }
      .data-table td::before { content: attr(data-label); flex: 0 0 auto; font-family: var(--font-mono); font-size: var(--font-size-2xs); letter-spacing: var(--letter-spacing-wide); text-transform: uppercase; color: var(--text-muted); text-align: left; }
      .data-table td[data-label=""]::before { display: none; }
      .data-table td.data-cell--primary { justify-content: flex-start; font-size: var(--font-size-base); font-weight: var(--font-weight-semibold); text-align: left; }
      .data-table td.data-cell--primary::before { display: none; }
      .data-table td.data-table__empty { justify-content: center; text-align: center; }
      .data-table td.data-table__empty::before { display: none; }
    }`;
