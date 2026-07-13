import {
  Repository,
  escapeLike,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** Lifecycle states an item can be in. */
export type ItemStatus = "draft" | "active" | "archived";

/** An item row as stored in SQLite (tags are comma-separated text). */
export interface Item {
  id: number;
  name: string;
  tags: string;
  status: ItemStatus;
  /** 0 = normal, 1 = unique (at most one unit in the whole system). */
  is_unique: number;
  /** Audit only: who created the item. The catalog is shared org-wide. */
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** Normalized shape used when creating/updating an item. */
export interface ItemInput {
  name: string;
  tags: string[];
  status: ItemStatus;
  /** Marks a serialized / one-of-a-kind item (max 1 unit system-wide). */
  isUnique: boolean;
}

/** Query inputs for the items list: search text, filters, and paging. */
export interface ItemListParams extends PageParams {
  /** Exact status filter, e.g. `"active"`. Empty means "any". */
  status?: string;
  /** Tag filter: items matching ANY of these whole tag tokens. */
  tags?: string[];
}

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    is_unique INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Split stored/comma-separated tags into a clean list. */
export function parseTags(raw: string): string[] {
  return raw
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

/** Collapse a tag list into a de-duplicated, comma-separated string. */
export function serializeTags(tags: string[]): string {
  return [...new Set(tags.map((t) => t.trim()).filter(Boolean))].join(",");
}

/** Data access for items. The catalog is shared org-wide (no per-user scoping). */
export class ItemRepository extends Repository {
  /**
   * One page of items, newest first. Free-text search matches the name only;
   * status and tag are exact-match filters. Backed by the shared `paginate`
   * helper so every module's list screen pages the same way.
   */
  list(params: ItemListParams = {}): Page<Item> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.status) {
      where.push("status = ?");
      bind.push(params.status);
    }
    const tags = params.tags ?? [];
    if (tags.length) {
      // Match a whole tag token inside the comma-joined `tags` string; an item
      // qualifies if it carries ANY of the selected tags (OR within the facet).
      const ors = tags.map(() => "(',' || tags || ',') LIKE ? ESCAPE '\\'");
      where.push(`(${ors.join(" OR ")})`);
      for (const t of tags) bind.push(`%,${escapeLike(t)},%`);
    }
    return this.paginate<Item>({
      from: "items",
      where,
      params: bind,
      searchColumns: ["name"],
      q: params.q,
      orderBy: "id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  /** Distinct tag tokens across all items, for the tag filter. */
  distinctTags(): string[] {
    const rows = this.db
      .query<{ tags: string }, []>(
        "SELECT DISTINCT tags FROM items WHERE tags <> ''"
      )
      .all();
    const set = new Set<string>();
    for (const row of rows) for (const t of parseTags(row.tags)) set.add(t);
    return [...set].sort((a, b) => a.localeCompare(b));
  }

  get(id: number): Item | null {
    return this.db
      .query<Item, [number]>("SELECT * FROM items WHERE id = ?")
      .get(id);
  }

  /**
   * Active items matching `q` by name or exact id, newest first, capped at
   * `limit`. Powers the movement line picker (only active items are movable).
   */
  searchActive(q: string, limit = 20): Item[] {
    const query = (q ?? "").trim();
    if (!query) {
      return this.db
        .query<Item, [number]>(
          "SELECT * FROM items WHERE status = 'active' ORDER BY id DESC LIMIT ?"
        )
        .all(limit);
    }
    const like = `%${escapeLike(query)}%`;
    const idMatch = /^\d+$/.test(query) ? Number(query) : -1;
    return this.db
      .query<Item, [string, number, number]>(
        `SELECT * FROM items
         WHERE status = 'active' AND (name LIKE ? ESCAPE '\\' OR id = ?)
         ORDER BY id DESC LIMIT ?`
      )
      .all(like, idMatch, limit);
  }

  create(input: ItemInput, createdBy: number): Item {
    const row = this.db
      .query<Item, [string, string, string, number, number]>(
        `INSERT INTO items (name, tags, status, is_unique, created_by)
         VALUES (?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.name,
        serializeTags(input.tags),
        input.status,
        input.isUnique ? 1 : 0,
        createdBy
      );
    if (!row) throw new Error("Failed to create item");
    return row;
  }

  update(id: number, input: ItemInput): Item | null {
    return this.db
      .query<Item, [string, string, string, number, number]>(
        `UPDATE items SET name = ?, tags = ?, status = ?, is_unique = ?,
           updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(
        input.name,
        serializeTags(input.tags),
        input.status,
        input.isUnique ? 1 : 0,
        id
      );
  }

  /**
   * Soft-delete: master data is never hard-deleted (foreign keys from
   * movements/inventory would break history). Archiving hides it from the
   * movable catalog while preserving references.
   */
  archive(id: number): Item | null {
    return this.db
      .query<Item, [number]>(
        `UPDATE items SET status = 'archived', updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(id);
  }
}
