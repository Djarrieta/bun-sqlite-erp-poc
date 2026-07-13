/**
 * Minimal, dependency-free CSV helpers shared by modules that import/export
 * data (inventory, movement lines). Bun runs without a build step, so a small
 * hand-rolled parser/serializer keeps things portable.
 *
 * Export conventions (Excel-in-Spanish friendly, per the project plan):
 *   - delimiter `;`
 *   - UTF-8 BOM prefix so Excel renders accents correctly
 *   - CRLF line endings
 *   - CSV-injection guard: a field starting with `= + - @` (or tab/CR) is
 *     prefixed with `'` so spreadsheets don't evaluate it as a formula
 *
 * Import is tolerant: it strips a leading BOM and accepts either `;` or `,` as
 * the delimiter (auto-detected from the first line).
 */

const BOM = "\uFEFF";

/** Escape one field for output: injection guard, then RFC-4180 quoting. */
function escapeField(raw: string): string {
  let v = raw ?? "";
  // Defuse spreadsheet formula injection on any field that leads with a
  // dangerous character. Our numeric/code fields never do, so this only ever
  // touches free-text like item names.
  if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
  // Quote when the field contains a delimiter (either kind), a quote, or a
  // line break; double any embedded quotes.
  if (/[";,\n\r]/.test(v)) v = '"' + v.replace(/"/g, '""') + '"';
  return v;
}

/**
 * Serialize rows (each an array of string cells) into a full CSV document with
 * a BOM, `;` delimiters and CRLF line endings. Pass the header as the first row.
 */
export function serializeCsv(rows: string[][]): string {
  const body = rows
    .map((cells) => cells.map(escapeField).join(";"))
    .join("\r\n");
  return BOM + body + "\r\n";
}

/**
 * Parse a CSV document into rows of string cells. Strips a leading BOM,
 * auto-detects `;` vs `,` from the first line, and handles RFC-4180 quoting
 * (embedded delimiters, quotes and newlines inside quoted fields). Fully empty
 * lines are dropped.
 */
export function parseCsv(text: string): string[][] {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const firstLine = text.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = firstLine.includes(";") ? ";" : ",";

  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch === "\r") {
      // ignore; handled by the following \n (or end of input)
    } else {
      field += ch;
    }
  }
  // Flush the trailing field/row when the file doesn't end in a newline.
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }

  // Drop rows that are entirely empty (e.g. a trailing blank line).
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}
