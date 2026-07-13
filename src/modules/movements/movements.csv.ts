import { parseCsv, serializeCsv } from "../../core/csv.ts";
import type { MovementLineRow } from "./movements.db.ts";

/** Format for line CSV: the item key is its `id`; `name` is informative only. */
const HEADER = ["item_id", "name", "quantity"];

/** One parsed data row. Null fields mean the value wasn't a valid integer. */
export interface ParsedLineRow {
  /** 1-based data row number (header excluded), for "fila N" messages. */
  rowNumber: number;
  itemId: number | null;
  quantity: number | null;
}

export interface ParsedLinesCsv {
  rows: ParsedLineRow[];
  /** Set when the whole file is unusable (empty or missing header). */
  fatal?: string;
}

/** Serialize a movement's lines to CSV (round-trips with the importer). */
export function serializeMovementLines(lines: MovementLineRow[]): string {
  const rows: string[][] = [HEADER];
  for (const l of lines)
    rows.push([String(l.item_id), l.item_name, String(l.quantity)]);
  return serializeCsv(rows);
}

/**
 * Parse a line CSV into structured rows. Requires the `item_id` header and
 * reads the item id from the first column and the quantity from the last (the
 * middle `name` column is ignored). Non-integer values become null so the
 * caller can report per-row errors; the caller also runs the DB/business checks.
 */
export function parseMovementLinesCsv(text: string): ParsedLinesCsv {
  const table = parseCsv(text);
  if (table.length === 0) return { rows: [], fatal: "El archivo está vacío." };

  const header = table[0]!;
  if ((header[0] ?? "").trim().toLowerCase() !== "item_id")
    return {
      rows: [],
      fatal: "La primera fila debe ser la cabecera: item_id;name;quantity.",
    };

  const rows: ParsedLineRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i]!;
    const idRaw = (cells[0] ?? "").trim();
    // Prefer a 3-column layout (item_id;name;quantity); tolerate item_id;quantity.
    const qtyRaw = (cells.length >= 3 ? cells[2] : cells[1] ?? "").trim();
    rows.push({
      rowNumber: i,
      itemId: /^\d+$/.test(idRaw) ? Number(idRaw) : null,
      quantity: /^\d+$/.test(qtyRaw) ? Number(qtyRaw) : null,
    });
  }
  return { rows };
}
