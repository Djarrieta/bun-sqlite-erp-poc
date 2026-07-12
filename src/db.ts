import { Database } from "bun:sqlite";

/**
 * Shared SQLite connection for the whole app. Repositories receive this
 * instance through the `Repository` base class; feature modules never open
 * their own connection. The database lives under `data/` (git-ignored).
 */
export const db = new Database("data/app.sqlite", { create: true });

// Improve concurrency and durability characteristics.
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
