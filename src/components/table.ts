/**
 * Generic, reusable data table. Modules describe their columns and rows; the
 * component handles markup, empty state, and optional clickable rows.
 */

export interface Column<T> {
  header: string;
  /** Returns ready-to-render HTML for the cell (escape user data yourself). */
  cell: (row: T) => string;
  align?: "left" | "center" | "right";
  width?: string;
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
              .map(
                (c) =>
                  `<td style="text-align:${c.align ?? "left"}">${c.cell(
                    row
                  )}</td>`
              )
              .join("");
            const href = rowHref?.(row);
            const attrs = href
              ? ` class="data-table__row data-table__row--link" onclick="location.href='${href}'"`
              : ` class="data-table__row"`;
            return `<tr${attrs}>${cells}</tr>`;
          })
          .join("");

  return `
  <style>
    .data-table-wrap { overflow-x:auto; -webkit-overflow-scrolling:touch; }
    .data-table { width:100%; border-collapse:collapse; font-size:var(--font-size-sm); }
    .data-table th, .data-table td { padding:var(--space-3) var(--space-4); border-bottom:1px solid var(--border-faint); white-space:nowrap; text-align:left; }
    .data-table thead th { background:var(--surface-sunken); text-transform:uppercase; letter-spacing:var(--letter-spacing-wide); font-family:var(--font-mono); font-size:var(--font-size-2xs); color:var(--text-muted); font-weight:var(--font-weight-medium); border-bottom:1px solid var(--border); }
    .data-table tbody td { font-variant-numeric:tabular-nums; }
    .data-table tbody tr:last-child td { border-bottom:none; }
    .data-table__row--link { cursor:pointer; }
    .data-table__row--link:hover { background:var(--surface-sunken); }
    .data-table__empty { text-align:center; padding:var(--space-6) 0; color:var(--text-muted); white-space:normal; }
  </style>
  <div class="data-table-wrap">
    <table class="data-table"${id ? ` id="${id}"` : ""}>
      <thead><tr>${head}</tr></thead>
      <tbody>${body}</tbody>
    </table>
  </div>`;
}
