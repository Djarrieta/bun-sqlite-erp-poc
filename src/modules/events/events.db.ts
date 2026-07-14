import {
  Repository,
  type Page,
  type PageParams,
} from "../../core/repository.ts";
import type { Role } from "../../core/permissions.ts";
import { db } from "../../db.ts";

/** Lifecycle states an event can be in. */
export type EventStatus = "draft" | "scheduled" | "done" | "cancelled";

/** A personal reply an assignee can give to an event. */
export type EventResponse = "accepted" | "declined";

/** An event row as stored in SQLite. */
export interface Event {
  id: number;
  title: string;
  description: string;
  /** Local datetime string, e.g. "2026-07-14T09:30" (from datetime-local). */
  start_at: string;
  /** Optional end datetime; empty string when not set. */
  end_at: string;
  status: EventStatus;
  /** The user who created the event. */
  created_by: number;
  created_at: string;
  updated_at: string;
}

/** An event row for the list, enriched with the creator's email + a tag count. */
export interface EventListRow extends Event {
  created_by_email: string;
  assignee_count: number;
}

/** A user tagged on an event (for the detail roster). */
export interface EventAssigneeUser {
  id: number;
  email: string;
}

/** A stored personal response, joined with the responder's email. */
export interface EventResponseRow {
  user_id: number;
  email: string;
  response: EventResponse;
  updated_at: string;
}

/** Normalized shape used when creating/updating an event. */
export interface EventInput {
  title: string;
  description: string;
  startAt: string;
  /** Empty string when the event has no end. */
  endAt: string;
  status: EventStatus;
  /** Users tagged directly on the event. */
  assigneeUserIds: number[];
  /** Roles tagged on the event (everyone with the role can see it). */
  assigneeRoles: Role[];
}

/** Query inputs for the events list: search text, filters, and paging. */
export interface EventListParams extends PageParams {
  /** The viewer — visibility is always scoped to them. */
  userId: number;
  role: string;
  /** Exact status filter. Empty means "any". */
  status?: string;
  /** Narrow to `"created"` (by me) or `"assigned"` (to me). Empty = all visible. */
  scope?: string;
}

// Parent table first: assignments and responses reference events(id).
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    start_at TEXT NOT NULL,
    end_at TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft',
    created_by INTEGER NOT NULL REFERENCES users(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Visibility tags: an event can be assigned to individual users and/or whole
// roles. Exactly one of user_id / role is set per row (enforced by CHECK).
db.exec(`
  CREATE TABLE IF NOT EXISTS event_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('user', 'role')),
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    role TEXT,
    UNIQUE (event_id, kind, user_id, role),
    CHECK (
      (kind = 'user' AND user_id IS NOT NULL AND role IS NULL) OR
      (kind = 'role' AND role IS NOT NULL AND user_id IS NULL)
    )
  );
`);

db.exec(
  `CREATE INDEX IF NOT EXISTS idx_event_assignments_event ON event_assignments(event_id);`
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_event_assignments_user ON event_assignments(user_id);`
);
db.exec(
  `CREATE INDEX IF NOT EXISTS idx_event_assignments_role ON event_assignments(role);`
);

// Per-user personal response. Absence of a row means "pending".
db.exec(`
  CREATE TABLE IF NOT EXISTS event_responses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    response TEXT NOT NULL CHECK (response IN ('accepted', 'declined')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (event_id, user_id)
  );
`);

/**
 * Data access for events. Unlike the shared catalog modules (items, locations),
 * events are per-viewer: a user only ever sees events they created or that tag
 * them directly or via their role. That scoping is baked into every read here.
 */
export class EventRepository extends Repository {
  /**
   * The visibility predicate reused by list + `canView`: the viewer created the
   * event, is tagged directly, or their role is tagged. Bound params, in order:
   * [userId, userId, role].
   */
  private static readonly VISIBLE = `(
    e.created_by = ?
    OR EXISTS (
      SELECT 1 FROM event_assignments a
      WHERE a.event_id = e.id
        AND ((a.kind = 'user' AND a.user_id = ?) OR (a.kind = 'role' AND a.role = ?))
    )
  )`;

  /**
   * One page of events the viewer may see, soonest-start first. Free-text
   * search matches title/description; status is an exact filter; `scope`
   * narrows to events created by or assigned to the viewer. Backed by the
   * shared `paginate` helper.
   */
  list(params: EventListParams): Page<EventListRow> {
    const where: string[] = [];
    const bind: (string | number)[] = [];

    // Visibility is always enforced. `scope` picks which visibility slice.
    if (params.scope === "created") {
      where.push("e.created_by = ?");
      bind.push(params.userId);
    } else if (params.scope === "assigned") {
      where.push(
        `EXISTS (
          SELECT 1 FROM event_assignments a
          WHERE a.event_id = e.id
            AND ((a.kind = 'user' AND a.user_id = ?) OR (a.kind = 'role' AND a.role = ?))
        )`
      );
      bind.push(params.userId, params.role);
    } else {
      where.push(EventRepository.VISIBLE);
      bind.push(params.userId, params.userId, params.role);
    }

    if (params.status) {
      where.push("e.status = ?");
      bind.push(params.status);
    }

    return this.paginate<EventListRow>({
      from: "events e JOIN users u ON u.id = e.created_by",
      select:
        "e.*, u.email AS created_by_email, " +
        "(SELECT COUNT(*) FROM event_assignments a WHERE a.event_id = e.id) AS assignee_count",
      where,
      params: bind,
      searchColumns: ["e.title", "e.description"],
      q: params.q,
      orderBy: "e.start_at DESC, e.id DESC",
      page: params.page,
      pageSize: params.pageSize,
    });
  }

  get(id: number): Event | null {
    return this.db
      .query<Event, [number]>("SELECT * FROM events WHERE id = ?")
      .get(id);
  }

  /** Whether `userId`/`role` may see event `id` (creator or tagged). */
  canView(userId: number, role: string, id: number): boolean {
    const row = this.db
      .query<{ n: number }, [number, number, number, string]>(
        `SELECT 1 AS n FROM events e
         WHERE e.id = ? AND ${EventRepository.VISIBLE} LIMIT 1`
      )
      .get(id, userId, userId, role);
    return !!row;
  }

  /**
   * Events the viewer may see whose start falls in `[startDate, endDate)` (ISO
   * `YYYY-MM-DD`, end exclusive), soonest first. Powers the calendar view. The
   * window is a bounded month/week, so no pagination is needed (capped for
   * safety). Lexicographic comparison is valid because `start_at` is stored as
   * `YYYY-MM-DDTHH:MM`, which sorts the same as chronological order.
   */
  rangeList(params: {
    userId: number;
    role: string;
    startDate: string;
    endDate: string;
  }): Event[] {
    return this.db
      .query<Event, [number, number, string, string, string]>(
        `SELECT e.* FROM events e
         WHERE ${EventRepository.VISIBLE}
           AND e.start_at >= ? AND e.start_at < ?
         ORDER BY e.start_at ASC LIMIT 1000`
      )
      .all(
        params.userId,
        params.userId,
        params.role,
        params.startDate,
        params.endDate
      );
  }

  /** Users tagged directly on the event, ordered by email. */
  assigneeUsers(eventId: number): EventAssigneeUser[] {
    return this.db
      .query<EventAssigneeUser, [number]>(
        `SELECT u.id, u.email FROM event_assignments a
         JOIN users u ON u.id = a.user_id
         WHERE a.event_id = ? AND a.kind = 'user'
         ORDER BY u.email ASC`
      )
      .all(eventId);
  }

  /** Roles tagged on the event. */
  assigneeRoles(eventId: number): Role[] {
    return this.db
      .query<{ role: Role }, [number]>(
        `SELECT role FROM event_assignments
         WHERE event_id = ? AND kind = 'role' ORDER BY role ASC`
      )
      .all(eventId)
      .map((r) => r.role);
  }

  /** All stored (non-pending) responses for an event, with responder emails. */
  listResponses(eventId: number): EventResponseRow[] {
    return this.db
      .query<EventResponseRow, [number]>(
        `SELECT r.user_id, u.email, r.response, r.updated_at
         FROM event_responses r JOIN users u ON u.id = r.user_id
         WHERE r.event_id = ? ORDER BY u.email ASC`
      )
      .all(eventId);
  }

  /** The viewer's own response, or null when they haven't replied. */
  responseOf(eventId: number, userId: number): EventResponse | null {
    const row = this.db
      .query<{ response: EventResponse }, [number, number]>(
        "SELECT response FROM event_responses WHERE event_id = ? AND user_id = ?"
      )
      .get(eventId, userId);
    return row?.response ?? null;
  }

  /** Insert or update the viewer's personal response. */
  setResponse(eventId: number, userId: number, response: EventResponse): void {
    this.db
      .query(
        `INSERT INTO event_responses (event_id, user_id, response)
         VALUES (?, ?, ?)
         ON CONFLICT (event_id, user_id)
         DO UPDATE SET response = excluded.response, updated_at = datetime('now')`
      )
      .run(eventId, userId, response);
  }

  create(input: EventInput, createdBy: number): Event {
    const tx = this.db.transaction((): Event => {
      const row = this.db
        .query<Event, [string, string, string, string, string, number]>(
          `INSERT INTO events (title, description, start_at, end_at, status, created_by)
           VALUES (?, ?, ?, ?, ?, ?) RETURNING *`
        )
        .get(
          input.title,
          input.description,
          input.startAt,
          input.endAt,
          input.status,
          createdBy
        );
      if (!row) throw new Error("Failed to create event");
      this.replaceAssignments(row.id, input);
      return row;
    });
    return tx();
  }

  update(id: number, input: EventInput): Event | null {
    const tx = this.db.transaction((): Event | null => {
      const row = this.db
        .query<Event, [string, string, string, string, string, number]>(
          `UPDATE events SET title = ?, description = ?, start_at = ?, end_at = ?,
             status = ?, updated_at = datetime('now')
           WHERE id = ? RETURNING *`
        )
        .get(
          input.title,
          input.description,
          input.startAt,
          input.endAt,
          input.status,
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
    // event and its tags/responses always disappear together.
    const tx = this.db.transaction(() => {
      this.db.query("DELETE FROM events WHERE id = ?").run(id);
    });
    tx();
  }

  /** Replace an event's user/role tags with the input's set (create + update). */
  private replaceAssignments(eventId: number, input: EventInput): void {
    this.db
      .query("DELETE FROM event_assignments WHERE event_id = ?")
      .run(eventId);
    const insertUser = this.db.query(
      "INSERT OR IGNORE INTO event_assignments (event_id, kind, user_id) VALUES (?, 'user', ?)"
    );
    for (const userId of input.assigneeUserIds) insertUser.run(eventId, userId);
    const insertRole = this.db.query(
      "INSERT OR IGNORE INTO event_assignments (event_id, kind, role) VALUES (?, 'role', ?)"
    );
    for (const role of input.assigneeRoles) insertRole.run(eventId, role);
  }
}
