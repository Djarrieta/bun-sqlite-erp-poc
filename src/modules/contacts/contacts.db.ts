import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** A contact row as stored in SQLite. Shared org-wide (no per-user scoping). */
export interface Contact {
  id: number;
  name: string;
  title: string;
  email: string;
  phone: string;
  /** Optional company the contact belongs to (null = unassigned). */
  company_id: number | null;
  is_active: number;
  notes: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** A contact joined with its company's name/code, for list screens. */
export interface ContactListRow extends Contact {
  company_name: string | null;
  company_code: string | null;
}

/** Normalized shape used when creating/updating a contact. */
export interface ContactInput {
  name: string;
  title: string;
  email: string;
  phone: string;
  /** Company id, or null when unassigned. */
  companyId: number | null;
  isActive: boolean;
  notes: string;
}

/** Query inputs for the contacts list: search, filters, and paging. */
export interface ContactListParams extends PageParams {
  /** Active filter: "1", "0", or "" (any). */
  active?: string;
  /** Restrict to one company. Undefined means "any". */
  companyId?: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS contacts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT NOT NULL DEFAULT '',
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_contacts_company ON contacts(company_id);
`);

const LIST_FROM = `contacts c LEFT JOIN companies co ON co.id = c.company_id`;
const LIST_SELECT = `c.*, co.name AS company_name, co.code AS company_code`;
const SEARCH_COLUMNS = ["c.name", "c.email", "c.phone", "co.name"];

/** Data access for contacts. The directory is shared org-wide. */
export class ContactRepository extends Repository {
  /**
   * One page of contacts, newest first, joined with their company. Free-text
   * search matches name/email/phone and company name; active and company are
   * exact-match filters.
   */
  list(params: ContactListParams = {}): Page<ContactListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.active === "1" || params.active === "0") {
      where.push("c.is_active = ?");
      bind.push(Number(params.active));
    }
    if (params.companyId) {
      where.push("c.company_id = ?");
      bind.push(params.companyId);
    }
    return this.paginate<ContactListRow>({
      from: LIST_FROM,
      select: LIST_SELECT,
      where,
      params: bind,
      searchColumns: SEARCH_COLUMNS,
      q: params.q,
      orderBy: "c.id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Contact | null {
    return this.db
      .query<Contact, [number]>("SELECT * FROM contacts WHERE id = ?")
      .get(id);
  }

  /** All contacts of a company, newest first — for the company detail page. */
  listByCompany(companyId: number): Contact[] {
    return this.db
      .query<Contact, [number]>(
        "SELECT * FROM contacts WHERE company_id = ? ORDER BY name ASC"
      )
      .all(companyId);
  }

  create(input: ContactInput, createdBy: number): Contact {
    const row = this.db
      .query<
        Contact,
        [string, string, string, string, number | null, number, string, number]
      >(
        `INSERT INTO contacts
           (name, title, email, phone, company_id, is_active, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.name,
        input.title,
        input.email,
        input.phone,
        input.companyId,
        input.isActive ? 1 : 0,
        input.notes,
        createdBy
      );
    if (!row) throw new Error("Failed to create contact");
    return row;
  }

  update(id: number, input: ContactInput): Contact | null {
    return this.db
      .query<
        Contact,
        [string, string, string, string, number | null, number, string, number]
      >(
        `UPDATE contacts SET name = ?, title = ?, email = ?, phone = ?,
           company_id = ?, is_active = ?, notes = ?, updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(
        input.name,
        input.title,
        input.email,
        input.phone,
        input.companyId,
        input.isActive ? 1 : 0,
        input.notes,
        id
      );
  }
}
