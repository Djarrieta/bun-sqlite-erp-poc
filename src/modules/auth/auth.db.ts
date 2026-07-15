import type { Role } from "../../core/permissions.ts";
import { Repository } from "../../core/repository.ts";
import { db } from "../../db.ts";

/**
 * Data access for the auth module.
 *
 * DIVERGENCE FROM THE MODULE PATTERN: a typical module owns a single table and
 * one repository (see `items.db.ts`). Auth is special — it owns two related
 * tables (users, sessions) and therefore two repositories. They are
 * consolidated here so the module still exposes a single `*.db.ts` entry point.
 * Tables are declared users-first because sessions holds a foreign key into
 * `users(id)`.
 */

/** An application user. Shared type imported across the app (type-only). */
export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  /** Linked Telegram numeric id (stored as text), or null when not linked. Set by admins. */
  telegram_id: string | null;
  created_at: string;
}

// --- Tables (users first: sessions references users.id) ---------------------

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    telegram_id TEXT UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

/** Data access for users. */
export class UserRepository extends Repository {
  findByEmail(email: string): User | null {
    return this.db
      .query<User, [string]>("SELECT * FROM users WHERE email = ?")
      .get(email);
  }

  findById(id: number): User | null {
    return this.db
      .query<User, [number]>("SELECT * FROM users WHERE id = ?")
      .get(id);
  }

  /** Resolve the user linked to a Telegram numeric id (as text), if any. */
  findByTelegramId(telegramId: string): User | null {
    return this.db
      .query<User, [string]>("SELECT * FROM users WHERE telegram_id = ?")
      .get(telegramId);
  }

  list(): User[] {
    return this.db.query<User, []>("SELECT * FROM users ORDER BY id ASC").all();
  }

  count(): number {
    return (
      this.db.query<{ n: number }, []>("SELECT COUNT(*) AS n FROM users").get()
        ?.n ?? 0
    );
  }

  countByRole(role: Role): number {
    return (
      this.db
        .query<{ n: number }, [Role]>(
          "SELECT COUNT(*) AS n FROM users WHERE role = ?"
        )
        .get(role)?.n ?? 0
    );
  }

  create(email: string, passwordHash: string, role: Role): User {
    const row = this.db
      .query<User, [string, string, Role]>(
        "INSERT INTO users (email, password_hash, role) VALUES (?, ?, ?) RETURNING *"
      )
      .get(email, passwordHash, role);
    if (!row) throw new Error("Failed to create user");
    return row;
  }

  updatePassword(id: number, passwordHash: string): void {
    this.db
      .query("UPDATE users SET password_hash = ? WHERE id = ?")
      .run(passwordHash, id);
  }

  /** Link (or unlink, passing null) a Telegram id to a user. */
  setTelegramId(id: number, telegramId: string | null): void {
    this.db
      .query("UPDATE users SET telegram_id = ? WHERE id = ?")
      .run(telegramId, id);
  }

  delete(id: number): void {
    this.db.query("DELETE FROM users WHERE id = ?").run(id);
  }
}

/** Data access for login sessions. */
export class SessionRepository extends Repository {
  create(id: string, userId: number, expiresAt: string): void {
    this.db
      .query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)")
      .run(id, userId, expiresAt);
  }

  /** Resolve the (non-expired) user owning a session, if any. */
  findUser(sessionId: string): User | null {
    return this.db
      .query<User, [string]>(
        `SELECT u.* FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.id = ? AND s.expires_at > datetime('now')`
      )
      .get(sessionId);
  }

  delete(sessionId: string): void {
    this.db.query("DELETE FROM sessions WHERE id = ?").run(sessionId);
  }

  /** Invalidate every session for a user (e.g. after a password change). */
  deleteByUser(userId: number): void {
    this.db.query("DELETE FROM sessions WHERE user_id = ?").run(userId);
  }

  /** Purge sessions whose expiry has already passed (housekeeping). */
  deleteExpired(): void {
    this.db
      .query("DELETE FROM sessions WHERE expires_at <= datetime('now')")
      .run();
  }
}
