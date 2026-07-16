import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import type { Role } from "../../core/permissions.ts";
import { db } from "../../db.ts";

/** Lifecycle states a task can be in. */
export type TaskStatus = "pending" | "in_progress" | "done" | "cancelled";

/** Task priority levels. */
export type TaskPriority = "low" | "medium" | "high";

/** A personal reply an assignee can give to a task. */
export type TaskResponse = "accepted" | "declined";

/** A task row as stored in SQLite. */
export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Local datetime "YYYY-MM-DDTHH:MM" (from datetime-local) or "" when unset. */
  start_at: string;
  /** Local datetime "YYYY-MM-DDTHH:MM" (deadline/end) or "" when unset. */
  end_at: string;
  /** Optional CRM context the task was created from. */
  company_id: number | null;
  project_id: number | null;
  visit_id: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** A task row for the list, enriched with the creator's email + a tag count. */
export interface TaskListRow extends Task {
  created_by_email: string;
  assignee_count: number;
}

/** A user tagged on a task (for the detail roster + pickers). */
export interface TaskAssigneeUser {
  id: number;
  email: string;
}

/** A stored personal response, joined with the responder's email. */
export interface TaskResponseRow {
  user_id: number;
  email: string;
  response: TaskResponse;
  updated_at: string;
}

/** Normalized shape used when creating/updating a task. */
export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Optional start datetime ("" when unset). */
  startAt: string;
  /** Optional end/deadline datetime ("" when unset). */
  endAt: string;
  /** Users tagged directly on the task. */
  assigneeUserIds: number[];
  /** Roles tagged on the task (everyone with the role can see it). */
  assigneeRoles: Role[];
}

/** Optional CRM context attached when a task is created (audit links). */
export interface TaskContext {
  companyId?: number | null;
  projectId?: number | null;
  visitId?: number | null;
}

/** Query inputs for the tasks list: viewer scope, search, filters, and paging. */
export interface TaskListParams extends PageParams {
  /** The viewer — visibility is always scoped to them. */
  userId: number;
  role: string;
  /** Exact status filter. Empty means "any". */
  status?: string;
  /** Exact priority filter. Empty means "any". */
  priority?: string;
  /** Narrow to "created" (by me) or "assigned" (to me). Empty = all visible. */
  scope?: string;
}

// Parent table first: assignments and responses reference tasks(id). visit_id is
// a forward reference to the visits module's table; SQLite permits referencing a
// table that does not yet exist at CREATE time (enforced on DML).
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    start_at TEXT NOT NULL DEFAULT '',
    end_at TEXT NOT NULL DEFAULT '',
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(created_by);
`);

// Visibility tags: a task can be assigned to individual users and/or whole
// roles. Exactly one of user_id / role is set per row (enforced by CHECK).
db.exec(`
  CREATE TABLE IF NOT EXISTS task_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('user', 'role')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT,
    UNIQUE (task_id, kind, user_id, role),
    CHECK (
      (kind = 'user' AND user_id IS NOT NULL AND role IS NULL) OR
      (kind = 'role' AND role IS NOT NULL AND user_id IS NULL)
    )
  );
  CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id);
  CREATE INDEX IF NOT EXISTS idx_task_assignments_user ON task_assignments(user_id);
  CREATE INDEX IF NOT EXISTS idx_task_assignments_role ON task_assignments(role);
`);

// Per-user personal response (accept/decline). Absence of a row means "pending".
db.exec(`
  CREATE TABLE IF NOT EXISTS task_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response TEXT NOT NULL CHECK (response IN ('accepted', 'declined')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (task_id, user_id)
  );
`);

/**
 * Data access for tasks. Tasks are per-viewer: a user only ever sees tasks they
 * created or that tag them directly or via their role. That scoping is baked
 * into every read here. Optional start/end dates place a task on the calendar.
 */
export class TaskRepository extends Repository {
  /**
   * The visibility predicate reused by list + `canView`: the viewer created the
   * task, is tagged directly, or their role is tagged. Bound params, in order:
   * [userId, userId, role].
   */
  private static readonly VISIBLE = `(
    t.created_by = ?
    OR EXISTS (
      SELECT 1 FROM task_assignments a
      WHERE a.task_id = t.id
        AND ((a.kind = 'user' AND a.user_id = ?) OR (a.kind = 'role' AND a.role = ?))
    )
  )`;

  /**
   * One page of tasks the viewer may see, newest first. Free-text search matches
   * title/description; status/priority are exact filters; `scope` narrows to
   * tasks created by or assigned to the viewer.
   */
  list(params: TaskListParams): Page<TaskListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];

    if (params.scope === "created") {
      where.push("t.created_by = ?");
      bind.push(params.userId);
    } else if (params.scope === "assigned") {
      where.push(
        `EXISTS (
          SELECT 1 FROM task_assignments a
          WHERE a.task_id = t.id
            AND ((a.kind = 'user' AND a.user_id = ?) OR (a.kind = 'role' AND a.role = ?))
        )`
      );
      bind.push(params.userId, params.role);
    } else {
      where.push(TaskRepository.VISIBLE);
      bind.push(params.userId, params.userId, params.role);
    }

    if (params.status) {
      where.push("t.status = ?");
      bind.push(params.status);
    }
    if (params.priority) {
      where.push("t.priority = ?");
      bind.push(params.priority);
    }

    return this.paginate<TaskListRow>({
      from: "tasks t JOIN users u ON u.id = t.created_by",
      select:
        "t.*, u.email AS created_by_email, " +
        "(SELECT COUNT(*) FROM task_assignments a WHERE a.task_id = t.id) AS assignee_count",
      where,
      params: bind,
      searchColumns: ["t.title", "t.description"],
      q: params.q,
      orderBy: "t.id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Task | null {
    return this.db
      .query<Task, [number]>("SELECT * FROM tasks WHERE id = ?")
      .get(id);
  }

  /** Whether `userId`/`role` may see task `id` (creator or tagged). */
  canView(userId: number, role: string, id: number): boolean {
    const row = this.db
      .query<{ n: number }, [number, number, number, string]>(
        `SELECT 1 AS n FROM tasks t WHERE t.id = ? AND ${TaskRepository.VISIBLE} LIMIT 1`
      )
      .get(id, userId, userId, role);
    return !!row;
  }

  /**
   * Tasks the viewer may see whose effective calendar date (start_at, or end_at
   * when there is no start) falls in `[startDate, endDate)` (ISO `YYYY-MM-DD`,
   * end exclusive), soonest first. Powers the calendar view. The window is a
   * bounded month/week, so no pagination is needed (capped for safety). Undated
   * tasks (no start and no end) never match and stay off the calendar.
   */
  rangeList(params: {
    userId: number;
    role: string;
    startDate: string;
    endDate: string;
  }): Task[] {
    const anchor = "COALESCE(NULLIF(t.start_at, ''), t.end_at)";
    return this.db
      .query<Task, [number, number, string, string, string]>(
        `SELECT t.* FROM tasks t
         WHERE ${TaskRepository.VISIBLE}
           AND ${anchor} >= ? AND ${anchor} < ?
         ORDER BY ${anchor} ASC LIMIT 1000`
      )
      .all(
        params.userId,
        params.userId,
        params.role,
        params.startDate,
        params.endDate
      );
  }

  /** Users tagged directly on the task, ordered by email. */
  assigneeUsers(taskId: number): TaskAssigneeUser[] {
    return this.db
      .query<TaskAssigneeUser, [number]>(
        `SELECT u.id, u.email FROM task_assignments a
         JOIN users u ON u.id = a.user_id
         WHERE a.task_id = ? AND a.kind = 'user'
         ORDER BY u.email ASC`
      )
      .all(taskId);
  }

  /** Roles tagged on the task. */
  assigneeRoles(taskId: number): Role[] {
    return this.db
      .query<{ role: Role }, [number]>(
        `SELECT role FROM task_assignments
         WHERE task_id = ? AND kind = 'role' ORDER BY role ASC`
      )
      .all(taskId)
      .map((r) => r.role);
  }

  /** All stored (non-pending) responses for a task, with responder emails. */
  listResponses(taskId: number): TaskResponseRow[] {
    return this.db
      .query<TaskResponseRow, [number]>(
        `SELECT r.user_id, u.email, r.response, r.updated_at
         FROM task_responses r JOIN users u ON u.id = r.user_id
         WHERE r.task_id = ? ORDER BY u.email ASC`
      )
      .all(taskId);
  }

  /** The viewer's own response, or null when they haven't replied. */
  responseOf(taskId: number, userId: number): TaskResponse | null {
    const row = this.db
      .query<{ response: TaskResponse }, [number, number]>(
        "SELECT response FROM task_responses WHERE task_id = ? AND user_id = ?"
      )
      .get(taskId, userId);
    return row?.response ?? null;
  }

  /** Insert or update the viewer's personal response. */
  setResponse(taskId: number, userId: number, response: TaskResponse): void {
    this.db
      .query(
        `INSERT INTO task_responses (task_id, user_id, response)
         VALUES (?, ?, ?)
         ON CONFLICT (task_id, user_id)
         DO UPDATE SET response = excluded.response, updated_at = datetime('now')`
      )
      .run(taskId, userId, response);
  }

  create(input: TaskInput, createdBy: number, context: TaskContext = {}): Task {
    const tx = this.db.transaction((): Task => {
      const row = this.db
        .query<
          Task,
          [
            string,
            string,
            string,
            string,
            string,
            string,
            number | null,
            number | null,
            number | null,
            number,
          ]
        >(
          `INSERT INTO tasks
             (title, description, status, priority, start_at, end_at,
              company_id, project_id, visit_id, created_by)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        )
        .get(
          input.title,
          input.description,
          input.status,
          input.priority,
          input.startAt,
          input.endAt,
          context.companyId ?? null,
          context.projectId ?? null,
          context.visitId ?? null,
          createdBy
        );
      if (!row) throw new Error("Failed to create task");
      this.replaceAssignments(row.id, input);
      return row;
    });
    return tx();
  }

  /** Update the editable fields. CRM context (company/project/visit) persists. */
  update(id: number, input: TaskInput): Task | null {
    const tx = this.db.transaction((): Task | null => {
      const row = this.db
        .query<Task, [string, string, string, string, string, string, number]>(
          `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?,
             start_at = ?, end_at = ?, updated_at = datetime('now')
           WHERE id = ? RETURNING *`
        )
        .get(
          input.title,
          input.description,
          input.status,
          input.priority,
          input.startAt,
          input.endAt,
          id
        );
      if (!row) return null;
      this.replaceAssignments(id, input);
      return row;
    });
    return tx();
  }

  delete(id: number): void {
    // Child rows go away via ON DELETE CASCADE; done in a transaction so the
    // task and its tags/responses always disappear together.
    const tx = this.db.transaction(() => {
      this.db.query("DELETE FROM tasks WHERE id = ?").run(id);
    });
    tx();
  }

  /** Replace a task's user/role tags with the input's set (create + update). */
  private replaceAssignments(taskId: number, input: TaskInput): void {
    this.db.query("DELETE FROM task_assignments WHERE task_id = ?").run(taskId);
    const insertUser = this.db.query(
      "INSERT OR IGNORE INTO task_assignments (task_id, kind, user_id) VALUES (?, 'user', ?)"
    );
    for (const userId of input.assigneeUserIds) insertUser.run(taskId, userId);
    const insertRole = this.db.query(
      "INSERT OR IGNORE INTO task_assignments (task_id, kind, role) VALUES (?, 'role', ?)"
    );
    for (const role of input.assigneeRoles) insertRole.run(taskId, role);
  }
}
