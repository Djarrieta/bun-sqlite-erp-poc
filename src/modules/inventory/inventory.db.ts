import {
  Repository,
  escapeLike,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/**
 * A stock balance row joined with its item and location for display/export.
 * The base table only stores ids + quantity; names come from the JOINs.
 */
export interface InventoryRow {
  id: number;
  item_id: number;
  location_id: number;
  quantity: number;
  updated_at: string;
  item_name: string;
  is_unique: number;
  location_code: string;
  location_name: string;
}

/** Query inputs for the inventory list/export: search, location filter, paging. */
export interface InventoryListParams extends PageParams {
  /** Restrict to one location. Undefined means "any". */
  locationId?: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES items(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    quantity INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (item_id, location_id),
    CHECK (quantity >= 0)
  );
  CREATE INDEX IF NOT EXISTS idx_inventory_location ON inventory(location_id);
  CREATE INDEX IF NOT EXISTS idx_inventory_item ON inventory(item_id);
`);

const FROM = `inventory inv
  JOIN items i ON i.id = inv.item_id
  JOIN locations l ON l.id = inv.location_id`;

const SELECT = `inv.id, inv.item_id, inv.location_id, inv.quantity,
  inv.updated_at, i.name AS item_name, i.is_unique AS is_unique,
  l.code AS location_code, l.name AS location_name`;

const SEARCH_COLUMNS = ["i.name", "l.code", "l.name"];

/**
 * Data access for the inventory ledger — the current balance of each item at
 * each location. Movements own the writes (`applyDelta`); the UI only reads.
 */
export class InventoryRepository extends Repository {
  /** Current quantity of an item at a location (0 when there is no row yet). */
  getQuantity(itemId: number, locationId: number): number {
    return (
      this.db
        .query<{ quantity: number }, [number, number]>(
          "SELECT quantity FROM inventory WHERE item_id = ? AND location_id = ?"
        )
        .get(itemId, locationId)?.quantity ?? 0
    );
  }

  /** Total quantity of an item across every location (for unique invariants). */
  totalQuantity(itemId: number): number {
    return (
      this.db
        .query<{ n: number }, [number]>(
          "SELECT COALESCE(SUM(quantity), 0) AS n FROM inventory WHERE item_id = ?"
        )
        .get(itemId)?.n ?? 0
    );
  }

  /** Total units (summed quantity) currently at a location — for summaries. */
  totalUnitsAtLocation(locationId: number): number {
    return (
      this.db
        .query<{ n: number }, [number]>(
          "SELECT COALESCE(SUM(quantity), 0) AS n FROM inventory WHERE location_id = ?"
        )
        .get(locationId)?.n ?? 0
    );
  }

  /**
   * Add `delta` (may be negative) to the balance of an item at a location. Run
   * inside a `db.transaction(...)`.
   *
   * Increments upsert the row (a fresh row starts at the positive delta).
   * Decrements must target an existing row (callers validate stock first) and
   * use a plain UPDATE so the table's `CHECK (quantity >= 0)` is evaluated on
   * the *resulting* balance — SQLite checks CHECK against the raw INSERT value
   * before `ON CONFLICT` resolves, so a negative delta can't go through upsert.
   * The CHECK still aborts the surrounding transaction if a decrement would
   * drive the balance negative.
   */
  applyDelta(itemId: number, locationId: number, delta: number): void {
    if (delta >= 0) {
      this.db
        .query(
          `INSERT INTO inventory (item_id, location_id, quantity)
           VALUES (?, ?, ?)
           ON CONFLICT(item_id, location_id) DO UPDATE
             SET quantity = quantity + excluded.quantity,
                 updated_at = datetime('now')`
        )
        .run(itemId, locationId, delta);
    } else {
      this.db
        .query(
          `UPDATE inventory
             SET quantity = quantity + ?, updated_at = datetime('now')
           WHERE item_id = ? AND location_id = ?`
        )
        .run(delta, itemId, locationId);
    }
  }

  /** Build the shared WHERE clause + bound params for list/export. */
  private filterSql(params: InventoryListParams): {
    where: string[];
    bind: (string | number)[];
  } {
    const where = ["inv.quantity > 0"];
    const bind: (string | number)[] = [];
    if (params.locationId) {
      where.push("inv.location_id = ?");
      bind.push(params.locationId);
    }
    return { where, bind };
  }

  /** One page of current balances (quantity > 0), joined with item + location. */
  list(params: InventoryListParams = {}): Page<InventoryRow> {
    const { where, bind } = this.filterSql(params);
    return this.paginate<InventoryRow>({
      from: FROM,
      select: SELECT,
      where,
      params: bind,
      searchColumns: SEARCH_COLUMNS,
      q: params.q,
      orderBy: "l.code ASC, i.name ASC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  /**
   * Every matching balance (no pagination), for CSV export. Honors the same
   * location and search filters as {@link list}.
   */
  exportRows(params: InventoryListParams = {}): InventoryRow[] {
    const { where, bind } = this.filterSql(params);
    const q = (params.q ?? "").trim();
    if (q) {
      const like = `%${escapeLike(q)}%`;
      where.push(`(${SEARCH_COLUMNS.map((c) => `${c} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
      for (const _ of SEARCH_COLUMNS) bind.push(like);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    return this.db
      .query<InventoryRow, (string | number)[]>(
        `SELECT ${SELECT} FROM ${FROM} ${whereSql} ORDER BY l.code ASC, i.name ASC`
      )
      .all(...bind);
  }
}
