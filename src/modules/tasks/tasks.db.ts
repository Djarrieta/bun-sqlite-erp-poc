import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import { db } from "../../db.ts";

/** Lifecycle states a task can be in. */
export type TaskStatus = "pending" | "in_progress" | "done";

/** Task priority levels. */
export type TaskPriority = "low" | "medium" | "high";

/** A task row as stored in SQLite. */
export interface Task {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  /** Local date "YYYY-MM-DD" or empty string when not set. */
  due_date: string;
  /** Assigned user, or null when unassigned. */
  assignee_id: number | null;
  /** Optional CRM context the task was created from. */
  company_id: number | null;
  project_id: number | null;
  visit_id: number | null;
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** A task joined with the assignee's email, for list screens. */
export interface TaskListRow extends Task {
  assignee_email: string | null;
}

/** Editable fields of a task (context links are set at creation). */
export interface TaskInput {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string;
  assigneeId: number | null;
}

/** Optional CRM context attached when a task is created. */
export interface TaskContext {
  companyId?: number | null;
  projectId?: number | null;
  visitId?: number | null;
}

/** Query inputs for the tasks list: viewer scope, search, filters, and paging. */
export interface TaskListParams extends PageParams {
  /** The viewer — visibility is always scoped to them. */
  userId: number;
  /** Exact status filter. Empty means "any". */
  status?: string;
  /** Exact priority filter. Empty means "any". */
  priority?: string;
  /** Narrow to "created" (by me) or "assigned" (to me). Empty = all visible. */
  scope?: string;
}

// visit_id is a forward reference to the visits module's table; SQLite permits
// referencing a table that does not yet exist at CREATE time (enforced on DML).
db.exec(`
  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'pending',
    priority TEXT NOT NULL DEFAULT 'medium',
    due_date TEXT NOT NULL DEFAULT '',
    assignee_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    company_id INTEGER REFERENCES companies(id) ON DELETE SET NULL,
    project_id INTEGER REFERENCES projects(id) ON DELETE SET NULL,
    visit_id INTEGER REFERENCES visits(id) ON DELETE SET NULL,
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_tasks_creator ON tasks(created_by);
  CREATE INDEX IF NOT EXISTS idx_tasks_visit ON tasks(visit_id);
`);

/**
 * Data access for tasks. Like events, tasks are per-viewer: a user only sees
 * tasks they created or are assigned to. That scoping is baked into every read.
 */
export class TaskRepository extends Repository {
  /** Visibility predicate reused by list + `canView`. Bind: [userId, userId]. */
  private static readonly VISIBLE = "(t.created_by = ? OR t.assignee_id = ?)";

  /**
   * One page of tasks the viewer may see, newest first. Free-text search
   * matches title/description; status/priority are exact filters; `scope`
   * narrows to tasks created by or assigned to the viewer.
   */
  list(params: TaskListParams): Page<TaskListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];

    if (params.scope === "created") {
      where.push("t.created_by = ?");
      bind.push(params.userId);
    } else if (params.scope === "assigned") {
      where.push("t.assignee_id = ?");
      bind.push(params.userId);
    } else {
      where.push(TaskRepository.VISIBLE);
      bind.push(params.userId, params.userId);
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
      from: "tasks t LEFT JOIN users u ON u.id = t.assignee_id",
      select: "t.*, u.email AS assignee_email",
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

  /** Whether `userId` may see task `id` (creator or assignee). */
  canView(userId: number, id: number): boolean {
    const row = this.db
      .query<{ n: number }, [number, number, number]>(
        `SELECT 1 AS n FROM tasks t WHERE t.id = ? AND ${TaskRepository.VISIBLE} LIMIT 1`
      )
      .get(id, userId, userId);
    return !!row;
  }

  create(
    input: TaskInput,
    createdBy: number,
    context: TaskContext = {}
  ): Task {
    const row = this.db
      .query<
        Task,
        [
          string,
          string,
          string,
          string,
          string,
          number | null,
          number | null,
          number | null,
          number | null,
          number,
        ]
      >(
        `INSERT INTO tasks
           (title, description, status, priority, due_date, assignee_id,
            company_id, project_id, visit_id, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
      )
      .get(
        input.title,
        input.description,
        input.status,
        input.priority,
        input.dueDate,
        input.assigneeId,
        context.companyId ?? null,
        context.projectId ?? null,
        context.visitId ?? null,
        createdBy
      );
    if (!row) throw new Error("Failed to create task");
    return row;
  }

  /** Update the editable fields. Context links (company/project/visit) persist. */
  update(id: number, input: TaskInput): Task | null {
    return this.db
      .query<
        Task,
        [string, string, string, string, string, number | null, number]
      >(
        `UPDATE tasks SET title = ?, description = ?, status = ?, priority = ?,
           due_date = ?, assignee_id = ?, updated_at = datetime('now')
         WHERE id = ? RETURNING *`
      )
      .get(
        input.title,
        input.description,
        input.status,
        input.priority,
        input.dueDate,
        input.assigneeId,
        id
      );
  }
}
