import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** Where a visit came from: the web form (text) or the Telegram bot (audio). */
export type VisitSource = "web" | "telegram";

/** Processing lifecycle. Web visits are `ready` immediately. */
export type VisitStatus = "draft" | "processing" | "ready" | "failed";

/** State of an extracted action item. */
export type ActionItemStatus = "suggested" | "dismissed" | "converted";

/** A visit (bitácora) row as stored in SQLite. Shared org-wide. */
export interface Visit {
  id: number;
  company_id: number | null;
  project_id: number | null;
  source: VisitSource;
  /** Manual notes (web visits). */
  notes: string;
  /** Stored audio filename under data/audio/ (empty = none). */
  audio_path: string;
  /** Transcribed audio (telegram visits). */
  transcript: string;
  /** AI summary of the visit. */
  summary: string;
  status: VisitStatus;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** A visit joined with its company + project for list screens. */
export interface VisitListRow extends Visit {
  company_name: string | null;
  company_code: string | null;
  project_name: string | null;
  project_code: string | null;
}

/** An extracted action item belonging to a visit. */
export interface VisitActionItem {
  id: number;
  visit_id: number;
  text: string;
  status: ActionItemStatus;
  task_id: number | null;
  created_at: string;
}

/** Normalized shape used when creating/updating a web visit. */
export interface VisitInput {
  companyId: number | null;
  projectId: number | null;
  notes: string;
}

/** Fields the bot supplies when logging a visit from a transcribed audio. */
export interface TelegramVisitInput {
  companyId: number | null;
  projectId: number | null;
  transcript: string;
  summary: string;
  audioPath: string;
}

/** Query inputs for the visits list: search, filters, and paging. */
export interface VisitListParams extends PageParams {
  companyId?: number;
  projectId?: number;
  status?: string;
  source?: string;
}

// task_id on visit_action_items is a forward reference to the tasks table;
// SQLite permits referencing a table that does not yet exist at CREATE time.
db.exec(`
  CREATE TABLE IF NOT EXISTS visits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    source TEXT NOT NULL DEFAULT 'web',
    notes TEXT NOT NULL DEFAULT '',
    audio_path TEXT NOT NULL DEFAULT '',
    transcript TEXT NOT NULL DEFAULT '',
    summary TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'ready',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS visit_action_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
    text TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'suggested',
    task_id INTEGER REFERENCES tasks(id) ON DELETE SET NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_visits_company ON visits(company_id);
  CREATE INDEX IF NOT EXISTS idx_visits_project ON visits(project_id);
  CREATE INDEX IF NOT EXISTS idx_visit_action_items_visit ON visit_action_items(visit_id);
`);

const LIST_FROM = `visits v
  LEFT JOIN companies co ON co.id = v.company_id
  LEFT JOIN projects pr ON pr.id = v.project_id`;
const LIST_SELECT = `v.*,
  co.name AS company_name, co.code AS company_code,
  pr.name AS project_name, pr.code AS project_code`;
const SEARCH_COLUMNS = ["v.notes", "v.summary", "v.transcript", "co.name", "pr.name"];

/** Data access for visits and their action items. Shared org-wide. */
export class VisitRepository extends Repository {
  /**
   * One page of visits, newest first, joined with company + project. Free-text
   * search matches notes/summary/transcript and company/project names;
   * company/project/status/source are exact filters.
   */
  list(params: VisitListParams = {}): Page<VisitListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];
    if (params.companyId) {
      where.push("v.company_id = ?");
      bind.push(params.companyId);
    }
    if (params.projectId) {
      where.push("v.project_id = ?");
      bind.push(params.projectId);
    }
    if (params.status) {
      where.push("v.status = ?");
      bind.push(params.status);
    }
    if (params.source) {
      where.push("v.source = ?");
      bind.push(params.source);
    }
    return this.paginate<VisitListRow>({
      from: LIST_FROM,
      select: LIST_SELECT,
      where,
      params: bind,
      searchColumns: SEARCH_COLUMNS,
      q: params.q,
      orderBy: "v.id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Visit | null {
    return this.db
      .query<Visit, [number]>("SELECT * FROM visits WHERE id = ?")
      .get(id);
  }

  /** Recent visits linked to a company (newest first), for its detail page. */
  listByCompany(companyId: number, limit = 50): VisitListRow[] {
    return this.db
      .query<VisitListRow, [number, number]>(
        `SELECT ${LIST_SELECT} FROM ${LIST_FROM}
         WHERE v.company_id = ? ORDER BY v.id DESC LIMIT ?`
      )
      .all(companyId, limit);
  }

  /** Recent visits linked to a project (newest first), for its detail page. */
  listByProject(projectId: number, limit = 50): VisitListRow[] {
    return this.db
      .query<VisitListRow, [number, number]>(
        `SELECT ${LIST_SELECT} FROM ${LIST_FROM}
         WHERE v.project_id = ? ORDER BY v.id DESC LIMIT ?`
      )
      .all(projectId, limit);
  }

  /** Create a web visit (manual notes). Ready immediately. */
  createWeb(input: VisitInput, createdBy: number): Visit {
    const row = this.db
      .query<Visit, [number | null, number | null, string, number]>(
        `INSERT INTO visits (company_id, project_id, notes, source, status, created_by)
         VALUES (?, ?, ?, 'web', 'ready', ?) RETURNING *`
      )
      .get(input.companyId, input.projectId, input.notes, createdBy);
    if (!row) throw new Error("Failed to create visit");
    return row;
  }

  /** Update a web visit's company/project/notes. */
  updateWeb(id: number, input: VisitInput): Visit | null {
    return this.db
      .query<Visit, [number | null, number | null, string, number]>(
        `UPDATE visits SET company_id = ?, project_id = ?, notes = ?,
           updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(input.companyId, input.projectId, input.notes, id);
  }

  /**
   * Create a visit from a transcribed Telegram audio, already summarized.
   * Ready immediately (the bot does the processing before calling this).
   */
  createFromTelegram(input: TelegramVisitInput, createdBy: number): Visit {
    const row = this.db
      .query<
        Visit,
        [number | null, number | null, string, string, string, number]
      >(
        `INSERT INTO visits
           (company_id, project_id, transcript, summary, audio_path, source, status, created_by)
         VALUES (?, ?, ?, ?, ?, 'telegram', 'ready', ?) RETURNING *`
      )
      .get(
        input.companyId,
        input.projectId,
        input.transcript,
        input.summary,
        input.audioPath,
        createdBy
      );
    if (!row) throw new Error("Failed to create visit");
    return row;
  }

  // --- Action items --------------------------------------------------------

  listActionItems(visitId: number): VisitActionItem[] {
    return this.db
      .query<VisitActionItem, [number]>(
        "SELECT * FROM visit_action_items WHERE visit_id = ? ORDER BY id ASC"
      )
      .all(visitId);
  }

  getActionItem(itemId: number): VisitActionItem | null {
    return this.db
      .query<VisitActionItem, [number]>(
        "SELECT * FROM visit_action_items WHERE id = ?"
      )
      .get(itemId);
  }

  /** Insert many action items atomically (used by the bot after extraction). */
  addActionItems(visitId: number, texts: string[]): void {
    const insert = this.db.transaction(() => {
      for (const text of texts) {
        const trimmed = text.trim();
        if (!trimmed) continue;
        this.db
          .query("INSERT INTO visit_action_items (visit_id, text) VALUES (?, ?)")
          .run(visitId, trimmed.slice(0, 500));
      }
    });
    insert();
  }

  /** Link an action item to the task it became (marks it converted). */
  convertActionItem(itemId: number, taskId: number): void {
    this.db
      .query(
        "UPDATE visit_action_items SET status = 'converted', task_id = ? WHERE id = ?"
      )
      .run(taskId, itemId);
  }

  /** Mark an action item as dismissed (won't become a task). */
  dismissActionItem(itemId: number): void {
    this.db
      .query(
        "UPDATE visit_action_items SET status = 'dismissed' WHERE id = ?"
      )
      .run(itemId);
  }
}
