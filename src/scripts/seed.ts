// Side-effect imports: ensure the auth + every module's tables exist before seeding.
import "../auth/auth.db.ts";
import "../modules/items/items.db.ts";
import "../modules/locations/locations.db.ts";
import "../modules/inventory/inventory.db.ts";
import "../modules/movements/movements.db.ts";
import "../modules/companies/companies.db.ts";
import "../modules/contacts/contacts.db.ts";
import "../modules/projects/projects.db.ts";
import "../modules/visits/visits.db.ts";
import "../modules/tasks/tasks.db.ts";
import "../modules/reports/reports.db.ts";
import { seedItems } from "../modules/items/items.seed.ts";
import { seedUsers } from "../modules/users/users.seed.ts";
import { seedLocations } from "../modules/locations/locations.seed.ts";
import { seedMovements } from "../modules/movements/movements.seed.ts";
import { seedCompanies } from "../modules/companies/companies.seed.ts";
import { seedContacts } from "../modules/contacts/contacts.seed.ts";
import { seedProjects } from "../modules/projects/projects.seed.ts";
import { seedVisits } from "../modules/visits/visits.seed.ts";
import { seedTasks } from "../modules/tasks/tasks.seed.ts";
import { seedReports } from "../modules/reports/reports.seed.ts";

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
seedCompanies();
seedContacts();
seedProjects();
seedVisits();
seedTasks();
seedMovements();
seedReports();
console.log("✅ Seed complete.");
