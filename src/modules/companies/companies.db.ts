import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** A company row as stored in SQLite. Shared org-wide (no per-user scoping). */
export interface Company {
  id: number;
  code: string;
  name: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  /** 1 = usable, 0 = archived. */
  is_active: number;
  notes: string;
  /** Audit only: who created the company. The directory is shared org-wide. */
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** Normalized shape used when creating/updating a company. */
export interface CompanyInput {
  code: string;
  name: string;
  industry: string;
  website: string;
  phone: string;
  email: string;
  isActive: boolean;
  notes: string;
}

/** Query inputs for the companies list: search text, filter, and paging. */
export interface CompanyListParams extends PageParams {
  /** Active filter: "1" (active), "0" (archived), or "" (any). */
  active?: string;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    industry TEXT NOT NULL DEFAULT '',
    website TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    is_active INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Data access for companies. The directory is shared org-wide. */
export class CompanyRepository extends Repository {
  /**
   * One page of companies, newest first. Free-text search matches the code,
   * name and industry; active is an exact-match filter.
   */
  list(params: CompanyListParams = {}): Page<Company> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.active === "1" || params.active === "0") {
      where.push("is_active = ?");
      bind.push(Number(params.active));
    }
    return this.paginate<Company>({
      from: "companies",
      where,
      params: bind,
      searchColumns: ["code", "name", "industry"],
      q: params.q,
      orderBy: "id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Company | null {
    return this.db
      .query<Company, [number]>("SELECT * FROM companies WHERE id = ?")
      .get(id);
  }

  /** Look up a company by its unique code (used to enforce uniqueness). */
  getByCode(code: string): Company | null {
    return this.db
      .query<Company, [string]>("SELECT * FROM companies WHERE code = ?")
      .get(code);
  }

  /** All active companies, ordered by name — for contact/project selects. */
  activeList(): Company[] {
    return this.db
      .query<Company, []>(
        "SELECT * FROM companies WHERE is_active = 1 ORDER BY name ASC"
      )
      .all();
  }

  create(input: CompanyInput, createdBy: number): Company {
    const row = this.db
      .query<
        Company,
        [string, string, string, string, string, string, number, string, number]
      >(
        `INSERT INTO companies
           (code, name, industry, website, phone, email, is_active, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.code,
        input.name,
        input.industry,
        input.website,
        input.phone,
        input.email,
        input.isActive ? 1 : 0,
        input.notes,
        createdBy
      );
    if (!row) throw new Error("Failed to create company");
    return row;
  }

  update(id: number, input: CompanyInput): Company | null {
    return this.db
      .query<
        Company,
        [string, string, string, string, string, string, number, string, number]
      >(
        `UPDATE companies SET code = ?, name = ?, industry = ?, website = ?,
           phone = ?, email = ?, is_active = ?, notes = ?,
           updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(
        input.code,
        input.name,
        input.industry,
        input.website,
        input.phone,
        input.email,
        input.isActive ? 1 : 0,
        input.notes,
        id
      );
  }
}
