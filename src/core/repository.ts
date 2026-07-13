import type { Database } from "bun:sqlite";
import { db as sharedDb } from "../db.ts";

/** Query-string style inputs a list screen sends: search text and page. */
export interface PageParams {
  /** Free-text search. Empty/whitespace means "no filter". */
  q?: string;
  /** 1-based page number. */
  page?: number;
  /** Rows per page. Clamped by the repository. */
  pageSize?: number;
}

/** A single page of rows plus the totals a paginator needs to render itself. */
export interface Page<Row> {
  rows: Row[];
  /** Total matching rows across every page (after filtering). */
  total: number;
  /** The (clamped) 1-based page that was actually returned. */
  page: number;
  /** The (clamped) page size that was actually applied. */
  pageSize: number;
}

/**
 * Describes a paginated + optionally searched query. Everything except `q` and
 * `params` is interpolated straight into SQL, so those structural parts
 * (`from`, `select`, `where`, `searchColumns`, `orderBy`) MUST be trusted,
 * developer-supplied strings — never user input. The user's search text is
 * passed safely as a bound parameter.
 */
export interface PaginateOptions {
  /** Table or FROM clause, e.g. `"items"`. */
  from: string;
  /** Columns to select. Defaults to `"*"`. */
  select?: string;
  /** Fixed filter conditions, ANDed together, e.g. `["user_id = ?"]`. */
  where?: string[];
  /** Bound params for `where`, in the order the `?` placeholders appear. */
  params?: (string | number)[];
  /** Columns matched (case-insensitive LIKE) against `q`, ORed together. */
  searchColumns?: string[];
  /** The user's search text (safely bound, LIKE-escaped). */
  q?: string;
  /** ORDER BY clause without the keyword, e.g. `"id DESC"`. */
  orderBy?: string;
  page?: number;
  pageSize?: number;
  /** Default page size when none is supplied. Defaults to 20. */
  defaultPageSize?: number;
  /** Hard cap on page size to keep queries bounded. Defaults to 100. */
  maxPageSize?: number;
}

/** Escape LIKE wildcards so user text matches literally under `ESCAPE '\'`. */
function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => "\\" + ch);
}

/**
 * Base class for all data-access repositories. Holds the shared database
 * connection so subclasses only focus on queries. Pass a different `Database`
 * (e.g. an in-memory one) to isolate tests.
 */
export abstract class Repository {
  constructor(protected readonly db: Database = sharedDb) {}

  /**
   * Runs a bounded, optionally-searched query plus its COUNT and returns one
   * `Page<Row>`. Modules build list screens on top of this so search +
   * pagination behave the same everywhere. See {@link PaginateOptions} for the
   * important security note about which fields are interpolated vs bound.
   */
  protected paginate<Row>(opts: PaginateOptions): Page<Row> {
    const page = Math.max(1, Math.trunc(opts.page ?? 1) || 1);
    const maxPageSize = opts.maxPageSize ?? 100;
    const pageSize = Math.min(
      maxPageSize,
      Math.max(1, Math.trunc(opts.pageSize ?? opts.defaultPageSize ?? 20) || 20)
    );
    const offset = (page - 1) * pageSize;

    const conditions = [...(opts.where ?? [])];
    const filterParams = [...(opts.params ?? [])];

    const q = (opts.q ?? "").trim();
    if (q && opts.searchColumns && opts.searchColumns.length > 0) {
      const like = `%${escapeLike(q)}%`;
      const ors = opts.searchColumns.map((c) => `${c} LIKE ? ESCAPE '\\'`);
      conditions.push(`(${ors.join(" OR ")})`);
      for (const _ of opts.searchColumns) filterParams.push(like);
    }

    const whereSql = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
    const orderSql = opts.orderBy ? `ORDER BY ${opts.orderBy}` : "";
    const select = opts.select ?? "*";

    const total =
      this.db
        .query<{ n: number }, (string | number)[]>(
          `SELECT COUNT(*) AS n FROM ${opts.from} ${whereSql}`
        )
        .get(...filterParams)?.n ?? 0;

    const rows = this.db
      .query<Row, (string | number)[]>(
        `SELECT ${select} FROM ${opts.from} ${whereSql} ${orderSql} LIMIT ? OFFSET ?`
      )
      .all(...filterParams, pageSize, offset);

    return { rows, total, page, pageSize };
  }
}
