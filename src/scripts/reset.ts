import { db } from "../db.ts";
// Side-effect imports: make sure the auth + every module's tables exist before
// we clear them, so a reset is deterministic even on a fresh database.
import "../auth/auth.db.ts";
import "../modules/items/items.db.ts";
import "../modules/locations/locations.db.ts";
import "../modules/inventory/inventory.db.ts";
import "../modules/movements/movements.db.ts";

/**
 * Wipe ALL application data — including users — leaving an empty schema behind.
 * Discovers user tables from `sqlite_master`, so new modules are cleared
 * automatically. Foreign keys are disabled during the wipe to avoid ordering
 * constraints, and AUTOINCREMENT counters are reset so ids start fresh.
 *
 * Run with: `bun resetdb`
 */
function resetDatabase(): void {
  const tables = db
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    )
    .all();

  db.exec("PRAGMA foreign_keys = OFF;");
  const clear = db.transaction(() => {
    for (const { name } of tables) db.exec(`DELETE FROM "${name}";`);
    const hasSequence = db
      .query("SELECT name FROM sqlite_master WHERE name = 'sqlite_sequence'")
      .get();
    if (hasSequence) db.exec("DELETE FROM sqlite_sequence;");
  });
  clear();
  db.exec("PRAGMA foreign_keys = ON;");

  console.log(`🗑️  Reset complete: cleared ${tables.length} table(s).`);
}

resetDatabase();
