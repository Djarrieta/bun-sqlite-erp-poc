import { UserRepository } from "../../auth/auth.db.ts";
import { EventRepository, type EventInput } from "./events.db.ts";

/**
 * Development seed for the events module. Events are per-viewer, so they are
 * created by the primary dev account and tagged to a mix of that user and whole
 * roles to exercise the visibility rules. Run `seedUsers` first so an owner
 * exists. Idempotent: skips when the owner already has events.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

/** Format a date offset from now as a `datetime-local` string (local time). */
function dtLocal(daysFromNow: number, hour: number, minute = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + daysFromNow);
  d.setHours(hour, minute, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
    d.getDate()
  )}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function seedEvents(): void {
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.warn("   events: no user available to own events, skipping");
    return;
  }
  const events = new EventRepository();
  if (events.list({ userId: owner.id, role: owner.role }).total > 0) {
    console.log("   events: already seeded, skipping");
    return;
  }

  const samples: EventInput[] = [
    {
      title: "Reunión de planificación",
      description: "Revisión trimestral del inventario y prioridades.",
      startAt: dtLocal(1, 9, 0),
      endAt: dtLocal(1, 10, 0),
      status: "scheduled",
      assigneeUserIds: [owner.id],
      assigneeRoles: ["logistic", "sales"],
    },
    {
      title: "Auditoría de bodega",
      description: "Conteo físico en Bodega Central.",
      startAt: dtLocal(3, 14, 0),
      endAt: "",
      status: "draft",
      assigneeUserIds: [],
      assigneeRoles: ["logistic"],
    },
    {
      title: "Cierre financiero mensual",
      description: "",
      startAt: dtLocal(7, 16, 0),
      endAt: dtLocal(7, 17, 30),
      status: "scheduled",
      assigneeUserIds: [],
      assigneeRoles: ["financial", "admin"],
    },
    {
      title: "Retrospectiva de ingeniería",
      description: "Qué salió bien y qué podemos mejorar.",
      startAt: dtLocal(-2, 11, 0),
      endAt: dtLocal(-2, 12, 0),
      status: "done",
      assigneeUserIds: [owner.id],
      assigneeRoles: ["engineer"],
    },
  ];

  let created = 0;
  for (const input of samples) {
    const event = events.create(input, owner.id);
    created++;
    // Give the owner a personal reply on the events they're tagged on.
    if (input.assigneeUserIds.includes(owner.id)) {
      events.setResponse(event.id, owner.id, "accepted");
    }
  }
  console.log(`   events: created ${created} events (owner ${owner.email})`);
}
