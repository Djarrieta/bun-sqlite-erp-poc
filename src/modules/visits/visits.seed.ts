import { UserRepository } from "../../auth/auth.db.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { ProjectRepository } from "../projects/projects.db.ts";
import { VisitRepository } from "./visits.db.ts";

/**
 * Development seed for the visits module. Creates one manual (web) visit and one
 * "audio" visit (as if captured by the bot) with a summary and a few action
 * items, so the bitácora → tareas flow can be tried without Telegram. The audio
 * file itself is not seeded (audio_path stays empty). Run after companies +
 * projects. Idempotent: skips when any visits already exist.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

export function seedVisits(): void {
  const visits = new VisitRepository();
  if (visits.list().total > 0) {
    console.log("   visits: already seeded, skipping");
    return;
  }
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.log("   visits: no owner user found, skipping");
    return;
  }
  const companies = new CompanyRepository();
  const projects = new ProjectRepository();
  const acme = companies.activeList().find((c) => c.code === "ACME") ?? null;
  const prj = projects.selectList().find((p) => p.code === "PRJ-01") ?? null;

  visits.createWeb(
    {
      companyId: acme?.id ?? null,
      projectId: null,
      notes:
        "Reunión de seguimiento con el equipo de compras. Interesados en ampliar el pedido para el próximo trimestre.",
    },
    owner.id
  );

  const audioVisit = visits.createFromTelegram(
    {
      companyId: acme?.id ?? null,
      projectId: prj?.id ?? null,
      transcript:
        "Estuve en la planta norte con Juan. Revisamos el avance del montaje. Falta enviar dos generadores y confirmar la fecha de instalación. Juan pidió una cotización actualizada para el viernes.",
      summary:
        "Visita a Planta Norte (ACME). Avance de montaje revisado con Juan. Pendientes: envío de equipo y cotización.",
      audioPath: "",
    },
    owner.id
  );
  visits.addActionItems(audioVisit.id, [
    "Enviar dos generadores a Planta Norte",
    "Confirmar fecha de instalación con Juan",
    "Preparar cotización actualizada para el viernes",
  ]);

  console.log("   visits: created 2 visits (1 manual, 1 audio) with action items");
}
