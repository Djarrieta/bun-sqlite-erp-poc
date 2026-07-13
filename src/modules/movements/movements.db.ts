import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";
import type { InventoryRepository } from "../inventory/inventory.db.ts";
import { validateConfirmation } from "./movements.rules.ts";

/** Movement type: entry, transfer between locations, or exit. */
export type MovementKind = "intake" | "transfer" | "dispatch";

/** Lifecycle: an editable draft, or an immutable confirmed movement. */
export type MovementStatus = "draft" | "confirmed";

/** A movement header row as stored in SQLite. */
export interface Movement {
  id: number;
  kind: MovementKind;
  origin_id: number | null;
  destination_id: number | null;
  status: MovementStatus;
  notes: string;
  created_by: number;
  created_at: string;
  updated_at: string;
  confirmed_at: string | null;
}

/** A movement joined with location codes + line count, for list screens. */
export interface MovementListRow extends Movement {
  origin_code: string | null;
  destination_code: string | null;
  line_count: number;
}

/** A movement line row as stored in SQLite. */
export interface MovementLine {
  id: number;
  movement_id: number;
  item_id: number;
  quantity: number;
}

/** A line joined with its item's display fields, for rendering/validation. */
export interface MovementLineRow extends MovementLine {
  item_name: string;
  is_unique: number;
  item_status: string;
}

/** Normalized shape used when creating/updating a movement header. */
export interface MovementInput {
  kind: MovementKind;
  originId: number | null;
  destinationId: number | null;
  notes: string;
}

/** Query inputs for the movements list: search, filters, and paging. */
export interface MovementListParams extends PageParams {
  kind?: string;
  status?: string;
  /** Restrict to movements touching this location (origin or destination). */
  locationId?: number;
}

/** Outcome of a confirmation attempt: applied, or rejected with reasons. */
export interface ConfirmResult {
  ok: boolean;
  errors: string[];
}

db.exec(`
  CREATE TABLE IF NOT EXISTS movements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'transfer',
    origin_id INTEGER REFERENCES locations(id),
    destination_id INTEGER REFERENCES locations(id),
    status TEXT NOT NULL DEFAULT 'draft',
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    confirmed_at TEXT,
    CHECK (
      (kind = 'transfer' AND origin_id IS NOT NULL AND destination_id IS NOT NULL AND origin_id <> destination_id) OR
      (kind = 'intake'   AND origin_id IS NULL     AND destination_id IS NOT NULL) OR
      (kind = 'dispatch' AND origin_id IS NOT NULL AND destination_id IS NULL)
    )
  );

  CREATE TABLE IF NOT EXISTS movement_lines (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    movement_id INTEGER NOT NULL REFERENCES movements(id) ON DELETE CASCADE,
    item_id INTEGER NOT NULL REFERENCES items(id),
    quantity INTEGER NOT NULL,
    UNIQUE (movement_id, item_id),
    CHECK (quantity > 0)
  );

  CREATE INDEX IF NOT EXISTS idx_movements_status ON movements(status);
  CREATE INDEX IF NOT EXISTS idx_movements_kind ON movements(kind);
  CREATE INDEX IF NOT EXISTS idx_movements_origin ON movements(origin_id);
  CREATE INDEX IF NOT EXISTS idx_movements_destination ON movements(destination_id);
  CREATE INDEX IF NOT EXISTS idx_movement_lines_item ON movement_lines(item_id);
`);

const LIST_FROM = `movements m
  LEFT JOIN locations o ON o.id = m.origin_id
  LEFT JOIN locations d ON d.id = m.destination_id`;

const LIST_SELECT = `m.*, o.code AS origin_code, d.code AS destination_code,
  (SELECT COUNT(*) FROM movement_lines ml WHERE ml.movement_id = m.id) AS line_count`;

/**
 * Data access for movements and their lines. Confirmation writes stock through
 * the injected {@link InventoryRepository} (the same shared connection), so the
 * whole apply step is one transaction.
 */
export class MovementRepository extends Repository {
  /**
   * One page of movements, newest first, joined with origin/destination codes
   * and a line count. Search matches location codes/names and notes; kind,
   * status and location are exact-match filters.
   */
  list(params: MovementListParams = {}): Page<MovementListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.kind) {
      where.push("m.kind = ?");
      bind.push(params.kind);
    }
    if (params.status) {
      where.push("m.status = ?");
      bind.push(params.status);
    }
    if (params.locationId) {
      where.push("(m.origin_id = ? OR m.destination_id = ?)");
      bind.push(params.locationId, params.locationId);
    }
    return this.paginate<MovementListRow>({
      from: LIST_FROM,
      select: LIST_SELECT,
      where,
      params: bind,
      searchColumns: ["o.code", "o.name", "d.code", "d.name", "m.notes"],
      q: params.q,
      orderBy: "m.id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Movement | null {
    return this.db
      .query<Movement, [number]>("SELECT * FROM movements WHERE id = ?")
      .get(id);
  }

  create(input: MovementInput, createdBy: number): Movement {
    const row = this.db
      .query<
        Movement,
        [string, number | null, number | null, string, number]
      >(
        `INSERT INTO movements (kind, origin_id, destination_id, notes, created_by)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.kind,
        input.originId,
        input.destinationId,
        input.notes,
        createdBy
      );
    if (!row) throw new Error("Failed to create movement");
    return row;
  }

  /** Update the header (locations/notes). Kind is fixed at creation. */
  updateHeader(id: number, input: MovementInput): Movement | null {
    return this.db
      .query<Movement, [number | null, number | null, string, number]>(
        `UPDATE movements SET origin_id = ?, destination_id = ?, notes = ?,
           updated_at = datetime('now')
         WHERE id = ? AND status = 'draft' RETURNING *`
      )
      .get(input.originId, input.destinationId, input.notes, id);
  }

  /** Delete a draft (cascades to its lines). Confirmed movements are immutable. */
  deleteDraft(id: number): void {
    this.db
      .query("DELETE FROM movements WHERE id = ? AND status = 'draft'")
      .run(id);
  }

  // --- Lines ---------------------------------------------------------------

  listLines(movementId: number): MovementLineRow[] {
    return this.db
      .query<MovementLineRow, [number]>(
        `SELECT ml.id, ml.movement_id, ml.item_id, ml.quantity,
                i.name AS item_name, i.is_unique AS is_unique, i.status AS item_status
         FROM movement_lines ml
         JOIN items i ON i.id = ml.item_id
         WHERE ml.movement_id = ?
         ORDER BY ml.id ASC`
      )
      .all(movementId);
  }

  hasLine(movementId: number, itemId: number): boolean {
    return !!this.db
      .query<{ id: number }, [number, number]>(
        "SELECT id FROM movement_lines WHERE movement_id = ? AND item_id = ?"
      )
      .get(movementId, itemId);
  }

  addLine(movementId: number, itemId: number, quantity: number): void {
    this.db
      .query(
        "INSERT INTO movement_lines (movement_id, item_id, quantity) VALUES (?, ?, ?)"
      )
      .run(movementId, itemId, quantity);
  }

  deleteLine(movementId: number, lineId: number): void {
    this.db
      .query("DELETE FROM movement_lines WHERE id = ? AND movement_id = ?")
      .run(lineId, movementId);
  }

  /** Insert many lines atomically (used by CSV import, all-or-nothing). */
  addLines(
    movementId: number,
    lines: { itemId: number; quantity: number }[]
  ): void {
    const insert = this.db.transaction(() => {
      for (const l of lines) this.addLine(movementId, l.itemId, l.quantity);
    });
    insert();
  }

  private markConfirmed(id: number): void {
    this.db
      .query(
        `UPDATE movements SET status = 'confirmed', confirmed_at = datetime('now'),
           updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(id);
  }

  // --- Confirmation --------------------------------------------------------

  /**
   * Validate and apply a draft movement to inventory in one transaction. Reads
   * current stock, checks per-line and unique-item invariants, then applies the
   * deltas (origin down, destination up) and marks the movement confirmed. On
   * any validation failure nothing is written and the reasons are returned.
   */
  confirm(id: number, inventory: InventoryRepository): ConfirmResult {
    const movement = this.get(id);
    if (!movement) return { ok: false, errors: ["Movimiento no encontrado."] };
    if (movement.status !== "draft")
      return { ok: false, errors: ["Solo se pueden confirmar borradores."] };

    const lines = this.listLines(id);
    if (lines.length === 0)
      return {
        ok: false,
        errors: ["Agrega al menos una línea antes de confirmar."],
      };

    const errors = validateConfirmation(movement, lines, inventory);
    if (errors.length > 0) return { ok: false, errors };

    const apply = this.db.transaction(() => {
      for (const line of lines) {
        if (movement.kind === "dispatch" || movement.kind === "transfer")
          inventory.applyDelta(line.item_id, movement.origin_id!, -line.quantity);
        if (movement.kind === "intake" || movement.kind === "transfer")
          inventory.applyDelta(
            line.item_id,
            movement.destination_id!,
            line.quantity
          );
      }
      this.markConfirmed(id);
    });

    try {
      apply();
    } catch {
      // Safety net: the table CHECK(quantity >= 0) rolls back if a decrement
      // would drive a balance negative despite validation.
      return {
        ok: false,
        errors: ["No se pudo aplicar el movimiento (stock insuficiente)."],
      };
    }
    return { ok: true, errors: [] };
  }
}
