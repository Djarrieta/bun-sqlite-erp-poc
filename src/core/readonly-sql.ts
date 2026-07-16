/**
 * Read-only SQL engine for the reports feature. It runs user/LLM-provided
 * `SELECT` queries against a SEPARATE, read-only SQLite connection, which is
 * the hard guarantee that a report can never mutate data — SQLite itself
 * rejects any write on this handle. On top of that connection we add defense in
 * depth: the query must be a single `SELECT`/`WITH` statement, may not use
 * administrative or write keywords, may not touch sensitive tables/columns, and
 * may only read tables the caller passes in `allowedTables` (the reports
 * catalog derives that set from the viewer's `view` permissions).
 */
import { Database } from "bun:sqlite";

/** Hard cap on rows returned to keep a heavy query from flooding a chart. */
export const MAX_REPORT_ROWS = 1000;

/** Thrown when a query is rejected before/while running. Safe to show. */
export class SqlValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SqlValidationError";
  }
}

/** A single executed query: its column order, rows, and a truncation flag. */
export interface QueryResult {
  columns: string[];
  rows: Record<string, unknown>[];
  truncated: boolean;
}

// Write DML/DDL — blocked here for a friendly message; the read-only connection
// would reject them anyway. None of these match our schema's column names
// (e.g. `\bcreate\b` does not match `created_at`).
const WRITE_TOKENS =
  /\b(insert|update|delete|drop|alter|truncate|create|replace\s+into|grant|revoke|reindex)\b/i;
// Administrative / connection-scope statements that a report must never use.
const META_TOKENS = /\b(attach|detach|pragma|vacuum)\b/i;
// Identifiers that are never exposed to reporting, for any role.
const SENSITIVE_TOKENS =
  /\b(password_hash|sessions|sqlite_master|sqlite_schema|sqlite_temp_master|sqlite_sequence)\b/i;

// Separate READ-ONLY handle to the same database file. Opened lazily so a
// process that never runs a report never opens it.
let roDb: Database | null = null;
function connection(): Database {
  if (!roDb) {
    roDb = new Database("data/app.sqlite", { readonly: true });
    // Belt and suspenders on top of the read-only open mode.
    roDb.exec("PRAGMA query_only = ON;");
  }
  return roDb;
}

/**
 * Remove block/line comments and single-quoted string literals so keyword and
 * identifier checks can't be fooled by text inside a string (e.g. a `;` or the
 * word `sessions` inside a WHERE literal).
 */
function stripCommentsAndStrings(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, " ' ' ");
}

/** Names introduced by a `WITH name AS (...)` clause — treated as local. */
function cteNames(cleanedSql: string): string[] {
  const re = /(?:\bwith\b|,)\s+("?)([a-zA-Z_][a-zA-Z0-9_]*)\1\s+as\s*\(/gi;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleanedSql))) names.push(m[2]!.toLowerCase());
  return names;
}

/** Tables referenced right after FROM/JOIN (ignores `FROM (subquery)`). */
function referencedTables(cleanedSql: string): string[] {
  const re = /\b(?:from|join)\s+("?)([a-zA-Z_][a-zA-Z0-9_]*)\1/gi;
  const names: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(cleanedSql))) names.push(m[2]!.toLowerCase());
  return names;
}

/**
 * Validate a query is a safe, read-only SELECT limited to `allowedTables`.
 * Throws {@link SqlValidationError} with a user-facing message on any problem.
 * `allowedTables` must be trusted, developer-supplied table names.
 */
export function assertReadableSql(sql: string, allowedTables: string[]): void {
  const trimmed = sql.trim();
  if (!trimmed) throw new SqlValidationError("La consulta está vacía.");

  const cleaned = stripCommentsAndStrings(trimmed);
  const body = cleaned.replace(/;\s*$/, "");

  if (body.includes(";"))
    throw new SqlValidationError("Solo se permite una sentencia SELECT.");
  if (!/^\s*(select|with)\b/i.test(body))
    throw new SqlValidationError("La consulta debe empezar con SELECT o WITH.");
  if (WRITE_TOKENS.test(body))
    throw new SqlValidationError(
      "Solo se permiten consultas de lectura (SELECT)."
    );
  if (META_TOKENS.test(body))
    throw new SqlValidationError(
      "No se permiten PRAGMA, ATTACH ni sentencias administrativas."
    );
  if (SENSITIVE_TOKENS.test(body))
    throw new SqlValidationError("La consulta referencia datos no permitidos.");

  const allowed = new Set(allowedTables.map((t) => t.toLowerCase()));
  for (const cte of cteNames(body)) allowed.add(cte);
  for (const table of referencedTables(body)) {
    if (!allowed.has(table))
      throw new SqlValidationError(
        `No tienes permiso para consultar la tabla "${table}".`
      );
  }
}

/**
 * Validate and execute a read-only report query, capped at
 * {@link MAX_REPORT_ROWS}. Returns the columns (in select order), the rows, and
 * whether the result was truncated. Throws {@link SqlValidationError} on a
 * rejected or failing query.
 */
export function runReportQuery(
  sql: string,
  allowedTables: string[]
): QueryResult {
  assertReadableSql(sql, allowedTables);

  const inner = sql.trim().replace(/;\s*$/, "");
  const wrapped = `SELECT * FROM (${inner}) AS _report LIMIT ?`;

  let rows: Record<string, unknown>[];
  try {
    rows = connection()
      .query<Record<string, unknown>, [number]>(wrapped)
      .all(MAX_REPORT_ROWS + 1);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    throw new SqlValidationError(`No se pudo ejecutar la consulta: ${message}`);
  }

  const truncated = rows.length > MAX_REPORT_ROWS;
  if (truncated) rows = rows.slice(0, MAX_REPORT_ROWS);
  const columns = rows.length ? Object.keys(rows[0]!) : [];
  return { columns, rows, truncated };
}
