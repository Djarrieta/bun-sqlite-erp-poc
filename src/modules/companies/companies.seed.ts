import { UserRepository } from "../../auth/auth.db.ts";
import { CompanyRepository, type CompanyInput } from "./companies.db.ts";

/**
 * Development seed for the companies module. The directory is shared org-wide,
 * so companies are attributed to the primary dev account for audit only — run
 * `seedUsers` first so an owner exists. Idempotent: skips when any companies
 * already exist.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

const SEED_COMPANIES: CompanyInput[] = [
  {
    code: "ACME",
    name: "Acme Industries",
    industry: "Manufactura",
    website: "https://acme.example",
    phone: "+52 55 1234 5678",
    email: "contacto@acme.example",
    isActive: true,
    notes: "",
  },
  {
    code: "GLOBEX",
    name: "Globex Corporation",
    industry: "Energía",
    website: "https://globex.example",
    phone: "+52 81 2345 6789",
    email: "ventas@globex.example",
    isActive: true,
    notes: "",
  },
  {
    code: "INITECH",
    name: "Initech",
    industry: "Tecnología",
    website: "https://initech.example",
    phone: "",
    email: "hola@initech.example",
    isActive: true,
    notes: "",
  },
  {
    code: "UMBRELLA",
    name: "Umbrella S.A.",
    industry: "Farmacéutica",
    website: "",
    phone: "+52 33 3456 7890",
    email: "",
    isActive: false,
    notes: "Cliente inactivo desde 2025.",
  },
];

export function seedCompanies(): void {
  const companies = new CompanyRepository();
  if (companies.list().total > 0) {
    console.log("   companies: already seeded, skipping");
    return;
  }
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.log("   companies: no owner user found, skipping");
    return;
  }
  for (const input of SEED_COMPANIES) companies.create(input, owner.id);
  console.log(`   companies: created ${SEED_COMPANIES.length} companies`);
}
