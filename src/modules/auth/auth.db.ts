import type { Role } from "../../core/permissions.ts";
import { Repository } from "../../core/repository.ts";
import { db } from "../../db.ts";

/**
 * Data access for the auth module.
 *
 * DIVERGENCE FROM THE MODULE PATTERN: a typical module owns a single table and
 * one repository (see `items.db.ts`). Auth is special — it owns three related
 * tables (users, sessions, password_reset_tokens) and therefore three
 * repositories. They are consolidated here so the module still exposes a single
 * `*.db.ts` entry point. Tables are declared users-first because the other two
 * hold foreign keys into `users(id)`.
 */

/** An application user. Shared type imported across the app (type-only). */
export interface User {
  id: number;
  email: string;
  password_hash: string;
  role: Role;
  created_at: string;
}

/** A one-time password-reset token row. */
export interface PasswordResetToken {
  token: string;
  user_id: number;
  expires_at: string;
  used: number;
  created_at: string;
}

// --- Tables (users first: sessions and reset tokens reference users.id) -----

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'member',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

// Migration: add role to pre-existing users tables that lack the column.
const userCols = db
  .query<{ name: string }, []>("PRAGMA table_info(users)")
  .all()
  .map((c) => c.name);
if (!userCols.includes("role")) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
}

db.exec(`
  CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS password_reset_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TEXT NOT NULL,
    used INTEGER NOT NULL DEFAULT 0,
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
}

/** Data access for one-time password-reset tokens. */
export class PasswordResetRepository extends Repository {
  create(token: string, userId: number, expiresAt: string): void {
    this.db
      .query(
        "INSERT INTO password_reset_tokens (token, user_id, expires_at) VALUES (?, ?, ?)"
      )
      .run(token, userId, expiresAt);
  }

  /** Return an unused, unexpired token row, or null. */
  findValid(token: string): PasswordResetToken | null {
    return this.db
      .query<PasswordResetToken, [string]>(
        `SELECT * FROM password_reset_tokens
         WHERE token = ? AND used = 0 AND expires_at > datetime('now')`
      )
      .get(token);
  }

  markUsed(token: string): void {
    this.db
      .query("UPDATE password_reset_tokens SET used = 1 WHERE token = ?")
      .run(token);
  }

  deleteByUser(userId: number): void {
    this.db
      .query("DELETE FROM password_reset_tokens WHERE user_id = ?")
      .run(userId);
  }
}
