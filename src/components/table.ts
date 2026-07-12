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
    .data-table { width:100%; border-collapse:collapse; font-size:var(--font-size-sm); }
    .data-table th, .data-table td { padding:0.6rem 0.75rem; border-bottom:1px solid var(--border-faint); }
    .data-table th { text-transform:uppercase; letter-spacing:0.04em; font-size:var(--font-size-xs); opacity:0.7; font-weight:var(--font-weight-medium); }
    .data-table__row--link { cursor:pointer; }
    .data-table__row--link:hover { background:color-mix(in srgb, var(--accent) 7%, transparent); }
    .data-table__empty { text-align:center; padding:2rem 0; opacity:0.6; }
  </style>
  <table class="data-table"${id ? ` id="${id}"` : ""}>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
  </table>`;
}
