import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** Lifecycle states a project can be in. */
export type ProjectStatus =
  | "prospect"
  | "active"
  | "on_hold"
  | "done"
  | "cancelled";

/** A project row as stored in SQLite. Shared org-wide (no per-user scoping). */
export interface Project {
  id: number;
  code: string;
  name: string;
  /** The company this project belongs to (required). */
  company_id: number;
  status: ProjectStatus;
  /** Local date "YYYY-MM-DD" or empty string when not set. */
  start_date: string;
  end_date: string;
  description: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** A project joined with its company's name/code, for list screens. */
export interface ProjectListRow extends Project {
  company_name: string;
  company_code: string;
}

/** Normalized shape used when creating/updating a project. */
export interface ProjectInput {
  code: string;
  name: string;
  companyId: number;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  description: string;
}

/** Query inputs for the projects list: search, filters, and paging. */
export interface ProjectListParams extends PageParams {
  /** Exact status filter. Empty means "any". */
  status?: string;
  /** Restrict to one company. Undefined means "any". */
  companyId?: number;
}

db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    company_id INTEGER NOT NULL REFERENCES companies(id),
    status TEXT NOT NULL DEFAULT 'prospect',
    start_date TEXT NOT NULL DEFAULT '',
    end_date TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_projects_company ON projects(company_id);
  CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
`);

const LIST_FROM = `projects p JOIN companies co ON co.id = p.company_id`;
const LIST_SELECT = `p.*, co.name AS company_name, co.code AS company_code`;
const SEARCH_COLUMNS = ["p.code", "p.name", "co.name"];

/** Data access for projects. The directory is shared org-wide. */
export class ProjectRepository extends Repository {
  /**
   * One page of projects, newest first, joined with their company. Free-text
   * search matches project code/name and company name; status and company are
   * exact-match filters.
   */
  list(params: ProjectListParams = {}): Page<ProjectListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.status) {
      where.push("p.status = ?");
      bind.push(params.status);
    }
    if (params.companyId) {
      where.push("p.company_id = ?");
      bind.push(params.companyId);
    }
    return this.paginate<ProjectListRow>({
      from: LIST_FROM,
      select: LIST_SELECT,
      where,
      params: bind,
      searchColumns: SEARCH_COLUMNS,
      q: params.q,
      orderBy: "p.id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Project | null {
    return this.db
      .query<Project, [number]>("SELECT * FROM projects WHERE id = ?")
      .get(id);
  }

  /** Look up a project by its unique code (used to enforce uniqueness). */
  getByCode(code: string): Project | null {
    return this.db
      .query<Project, [string]>("SELECT * FROM projects WHERE code = ?")
      .get(code);
  }

  /** All projects of a company, newest first — for the company detail page. */
  listByCompany(companyId: number): Project[] {
    return this.db
      .query<Project, [number]>(
        "SELECT * FROM projects WHERE company_id = ? ORDER BY id DESC"
      )
      .all(companyId);
  }

  /** All projects ordered by code — for select inputs (e.g. the visit form). */
  selectList(): Project[] {
    return this.db
      .query<Project, []>("SELECT * FROM projects ORDER BY code ASC")
      .all();
  }

  create(input: ProjectInput, createdBy: number): Project {
    const row = this.db
      .query<
        Project,
        [string, string, number, string, string, string, string, number]
      >(
        `INSERT INTO projects
           (code, name, company_id, status, start_date, end_date, description, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.code,
        input.name,
        input.companyId,
        input.status,
        input.startDate,
        input.endDate,
        input.description,
        createdBy
      );
    if (!row) throw new Error("Failed to create project");
    return row;
  }

  update(id: number, input: ProjectInput): Project | null {
    return this.db
      .query<
        Project,
        [string, string, number, string, string, string, string, number]
      >(
        `UPDATE projects SET code = ?, name = ?, company_id = ?, status = ?,
           start_date = ?, end_date = ?, description = ?, updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(
        input.code,
        input.name,
        input.companyId,
        input.status,
        input.startDate,
        input.endDate,
        input.description,
        id
      );
  }
}
