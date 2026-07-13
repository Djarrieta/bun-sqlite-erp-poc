import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** Kinds of physical/logical stock locations. */
export type LocationKind = "warehouse" | "store" | "transit";

/** A location row as stored in SQLite. */
export interface Location {
  id: number;
  code: string;
  name: string;
  kind: LocationKind;
  /** 1 = usable in movements, 0 = archived. */
  is_active: number;
  created_at: string;
  updated_at: string;
}

/** Normalized shape used when creating/updating a location. */
export interface LocationInput {
  code: string;
  name: string;
  kind: LocationKind;
  isActive: boolean;
}

/** Query inputs for the locations list: search text, filters, and paging. */
export interface LocationListParams extends PageParams {
  /** Exact kind filter. Empty means "any". */
  kind?: string;
  /** Active filter: "1" (active), "0" (archived), or "" (any). */
  active?: string;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS locations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'warehouse',
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Data access for locations. The directory is shared org-wide. */
export class LocationRepository extends Repository {
  /**
   * One page of locations, newest first. Free-text search matches the code and
   * name; kind and active are exact-match filters.
   */
  list(params: LocationListParams = {}): Page<Location> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.kind) {
      where.push("kind = ?");
      bind.push(params.kind);
    }
    if (params.active === "1" || params.active === "0") {
      where.push("is_active = ?");
      bind.push(Number(params.active));
    }
    return this.paginate<Location>({
      from: "locations",
      where,
      params: bind,
      searchColumns: ["code", "name"],
      q: params.q,
      orderBy: "id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Location | null {
    return this.db
      .query<Location, [number]>("SELECT * FROM locations WHERE id = ?")
      .get(id);
  }

  /** Look up a location by its unique code (used to enforce uniqueness). */
  getByCode(code: string): Location | null {
    return this.db
      .query<Location, [string]>("SELECT * FROM locations WHERE code = ?")
      .get(code);
  }

  /** All active locations, ordered by code — for movement origin/destination selects. */
  activeList(): Location[] {
    return this.db
      .query<Location, []>(
        "SELECT * FROM locations WHERE is_active = 1 ORDER BY code ASC"
      )
      .all();
  }

  create(input: LocationInput): Location {
    const row = this.db
      .query<Location, [string, string, string, number]>(
        `INSERT INTO locations (code, name, kind, is_active)
         VALUES (?, ?, ?, ?) RETURNING *`
      )
      .get(input.code, input.name, input.kind, input.isActive ? 1 : 0);
    if (!row) throw new Error("Failed to create location");
    return row;
  }

  update(id: number, input: LocationInput): Location | null {
    return this.db
      .query<Location, [string, string, string, number, number]>(
        `UPDATE locations SET code = ?, name = ?, kind = ?, is_active = ?,
           updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(input.code, input.name, input.kind, input.isActive ? 1 : 0, id);
  }
}
