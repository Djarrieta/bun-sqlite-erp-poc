import { UserRepository } from "../../auth/auth.db.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { ContactRepository } from "./contacts.db.ts";

/**
 * Development seed for the contacts module. Links a few contacts to the seeded
 * companies (by code). Run after `seedCompanies`. Idempotent: skips when any
 * contacts already exist.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

interface SeedContact {
  name: string;
  title: string;
  email: string;
  phone: string;
  companyCode: string | null;
}

const SEED_CONTACTS: SeedContact[] = [
  { name: "Juan Pérez", title: "Gerente de Compras", email: "juan.perez@acme.example", phone: "+52 55 1111 2222", companyCode: "ACME" },
  { name: "María López", title: "Directora de Operaciones", email: "maria.lopez@acme.example", phone: "", companyCode: "ACME" },
  { name: "Carlos Ruiz", title: "Ingeniero de Proyecto", email: "carlos.ruiz@globex.example", phone: "+52 81 3333 4444", companyCode: "GLOBEX" },
  { name: "Ana Gómez", title: "CTO", email: "ana.gomez@initech.example", phone: "", companyCode: "INITECH" },
  { name: "Luis Fernández", title: "Consultor", email: "luis@freelance.example", phone: "+52 55 5555 6666", companyCode: null },
];

export function seedContacts(): void {
  const contacts = new ContactRepository();
  if (contacts.list().total > 0) {
    console.log("   contacts: already seeded, skipping");
    return;
  }
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.log("   contacts: no owner user found, skipping");
    return;
  }
  const companies = new CompanyRepository();
  const byCode = new Map(companies.activeList().map((c) => [c.code, c.id]));

  for (const seed of SEED_CONTACTS) {
    const companyId = seed.companyCode
      ? byCode.get(seed.companyCode) ?? null
      : null;
    contacts.create(
      {
        name: seed.name,
        title: seed.title,
        email: seed.email,
        phone: seed.phone,
        companyId,
        isActive: true,
        notes: "",
      },
      owner.id
    );
  }
  console.log(`   contacts: created ${SEED_CONTACTS.length} contacts`);
}
