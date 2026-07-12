import type { Database } from "bun:sqlite";
import { db as sharedDb } from "../db.ts";

/**
 * Base class for all data-access repositories. Holds the shared database
 * connection so subclasses only focus on queries. Pass a different `Database`
 * (e.g. an in-memory one) to isolate tests.
 */
export abstract class Repository {
  constructor(protected readonly db: Database = sharedDb) {}
}
