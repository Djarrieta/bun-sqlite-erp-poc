// Side-effect imports: ensure every module's tables exist before seeding.
import "../modules/auth/auth.db.ts";
import "../modules/items/items.db.ts";
import { seedItems } from "../modules/items/items.seed.ts";
import { seedUsers } from "../modules/users/users.seed.ts";

/**
 * Populate the database from each module's `*.seed.ts` file. Seeds run in
 * dependency order: users first, then modules that reference them (items are
 * owned by a user). Every seed is idempotent, so this is safe to re-run.
 *
 * Run with: `bun seeddb`
 */
console.log("🌱 Seeding database...");
await seedUsers();
seedItems();
console.log("✅ Seed complete.");
