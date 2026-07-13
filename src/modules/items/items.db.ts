import { Repository, type Page, type PageParams } from "../../core/repository.ts";
import { db } from "../../db.ts";

/** Lifecycle states an item can be in. */
export type ItemStatus = "draft" | "active" | "archived";

/** An item row as stored in SQLite (tags are comma-separated text). */
export interface Item {
  id: number;
  name: string;
  tags: string;
  status: ItemStatus;
  user_id: number;
  created_at: string;
  updated_at: string;
}

/** Normalized shape used when creating/updating an item. */
export interface ItemInput {
  name: string;
  tags: string[];
  status: ItemStatus;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    tags TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
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

/** Data access for items, scoped to the owning user. */
export class ItemRepository extends Repository {
  /**
   * One page of the user's items, newest first, optionally filtered by a search
   * that matches the name or any tag. Backed by the shared `paginate` helper so
   * every module's list screen searches and pages the same way.
   */
  list(userId: number, params: PageParams = {}): Page<Item> {
    return this.paginate<Item>({
      from: "items",
      where: ["user_id = ?"],
      params: [userId],
      searchColumns: ["name", "tags"],
      q: params.q,
      orderBy: "id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number, userId: number): Item | null {
    return this.db
      .query<Item, [number, number]>(
        "SELECT * FROM items WHERE id = ? AND user_id = ?"
      )
      .get(id, userId);
  }

  create(input: ItemInput, userId: number): Item {
    const row = this.db
      .query<Item, [string, string, string, number]>(
        "INSERT INTO items (name, tags, status, user_id) VALUES (?, ?, ?, ?) RETURNING *"
      )
      .get(input.name, serializeTags(input.tags), input.status, userId);
    if (!row) throw new Error("Failed to create item");
    return row;
  }

  update(id: number, input: ItemInput, userId: number): Item | null {
    return this.db
      .query<Item, [string, string, string, number, number]>(
        `UPDATE items SET name = ?, tags = ?, status = ?, updated_at = datetime('now')
         WHERE id = ? AND user_id = ? RETURNING *`
      )
      .get(input.name, serializeTags(input.tags), input.status, id, userId);
  }

  delete(id: number, userId: number): void {
    this.db
      .query("DELETE FROM items WHERE id = ? AND user_id = ?")
      .run(id, userId);
  }
}
