// Side-effect imports: ensure every module's tables exist before seeding.
import "../modules/auth/auth.db.ts";
import "../modules/items/items.db.ts";
import "../modules/locations/locations.db.ts";
import "../modules/inventory/inventory.db.ts";
import "../modules/movements/movements.db.ts";
import { seedItems } from "../modules/items/items.seed.ts";
import { seedUsers } from "../modules/users/users.seed.ts";
import { seedLocations } from "../modules/locations/locations.seed.ts";
import { seedMovements } from "../modules/movements/movements.seed.ts";

/**
 * Populate the database from each module's `*.seed.ts` file. Seeds run in
 * dependency order: users first, then the shared catalog (items) and locations,
 * then movements (which create + confirm intakes to populate inventory). Every
 * seed is idempotent, so this is safe to re-run.
 *
 * Run with: `bun seeddb`
 */
console.log("🌱 Seeding database...");
await seedUsers();
seedItems();
seedLocations();
seedMovements();
console.log("✅ Seed complete.");
