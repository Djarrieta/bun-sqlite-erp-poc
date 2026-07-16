import { UserRepository } from "../../auth/auth.db.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { LocationRepository } from "../locations/locations.db.ts";
import { ProjectRepository, type ProjectStatus } from "./projects.db.ts";

/**
 * Development seed for the projects module. Links a few projects to seeded
 * companies (by code) and attaches a couple of locations to the first project
 * so the equipment-transfer flow has something to show. Run after
 * `seedCompanies` and `seedLocations`. Idempotent: skips when any projects exist.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

interface SeedProject {
  code: string;
  name: string;
  companyCode: string;
  status: ProjectStatus;
  startDate: string;
  endDate: string;
  description: string;
}

const SEED_PROJECTS: SeedProject[] = [
  { code: "PRJ-01", name: "Planta Norte", companyCode: "ACME", status: "active", startDate: "2026-03-01", endDate: "", description: "Montaje de línea de producción en la planta norte." },
  { code: "PRJ-02", name: "Migración ERP", companyCode: "INITECH", status: "prospect", startDate: "", endDate: "", description: "Propuesta de migración de sistemas." },
  { code: "PRJ-03", name: "Expansión Sur", companyCode: "GLOBEX", status: "on_hold", startDate: "2026-01-15", endDate: "2026-06-30", description: "" },
];

export function seedProjects(): void {
  const projects = new ProjectRepository();
  if (projects.list().total > 0) {
    console.log("   projects: already seeded, skipping");
    return;
  }
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.log("   projects: no owner user found, skipping");
    return;
  }
  const companies = new CompanyRepository();
  const byCode = new Map(companies.activeList().map((c) => [c.code, c.id]));

  const created: Record<string, number> = {};
  for (const seed of SEED_PROJECTS) {
    const companyId = byCode.get(seed.companyCode);
    if (!companyId) continue; // company not seeded; skip this project
    const project = projects.create(
      {
        code: seed.code,
        name: seed.name,
        companyId,
        status: seed.status,
        startDate: seed.startDate,
        endDate: seed.endDate,
        description: seed.description,
      },
      owner.id
    );
    created[seed.code] = project.id;
  }

  // Attach a couple of locations to the first project for the transfer demo.
  const firstProjectId = created["PRJ-01"];
  if (firstProjectId) {
    const locations = new LocationRepository();
    const available = locations.activeUnassigned().slice(0, 2);
    for (const location of available)
      locations.assignProject(location.id, firstProjectId);
  }

  console.log(`   projects: created ${Object.keys(created).length} projects`);
}
