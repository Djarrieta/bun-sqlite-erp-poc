import { UserRepository } from "../../auth/auth.db.ts";
import { TaskRepository, type TaskInput } from "./tasks.db.ts";

/**
 * Development seed for the tasks module. Tasks are per-viewer, so they are
 * created by the primary dev account and tagged to a mix of that user and whole
 * roles to exercise the visibility rules. Some carry optional start/end dates so
 * they show on the calendar. Run `seedUsers` first. Idempotent: skips when the
 * owner already has tasks.
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

export function seedTasks(): void {
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.log("   tasks: no owner user found, skipping");
    return;
  }
  const tasks = new TaskRepository();
  if (tasks.list({ userId: owner.id, role: owner.role }).total > 0) {
    console.log("   tasks: already seeded, skipping");
    return;
  }

  const samples: TaskInput[] = [
    {
      title: "Llamar a Juan Pérez (ACME)",
      description: "Dar seguimiento a la cotización.",
      status: "pending",
      priority: "high",
      startAt: dtLocal(1, 9, 0),
      endAt: dtLocal(1, 9, 30),
      assigneeUserIds: [owner.id],
      assigneeRoles: ["sales"],
    },
    {
      title: "Preparar propuesta Initech",
      description: "",
      status: "in_progress",
      priority: "medium",
      startAt: "",
      endAt: dtLocal(4, 18, 0),
      assigneeUserIds: [owner.id],
      assigneeRoles: [],
    },
    {
      title: "Revisar equipo en Planta Norte",
      description: "Confirmar recepción del traslado.",
      status: "pending",
      priority: "low",
      startAt: "",
      endAt: "",
      assigneeUserIds: [],
      assigneeRoles: ["logistic"],
    },
    {
      title: "Auditoría de bodega",
      description: "Conteo físico en Bodega Central.",
      status: "pending",
      priority: "medium",
      startAt: dtLocal(3, 14, 0),
      endAt: "",
      assigneeUserIds: [],
      assigneeRoles: ["logistic"],
    },
    {
      title: "Retrospectiva de ingeniería",
      description: "Qué salió bien y qué podemos mejorar.",
      status: "done",
      priority: "low",
      startAt: dtLocal(-2, 11, 0),
      endAt: dtLocal(-2, 12, 0),
      assigneeUserIds: [owner.id],
      assigneeRoles: ["engineer"],
    },
  ];

  let created = 0;
  for (const input of samples) {
    const task = tasks.create(input, owner.id);
    created++;
    // Give the owner a personal reply on the tasks they're tagged on.
    if (input.assigneeUserIds.includes(owner.id)) {
      tasks.setResponse(task.id, owner.id, "accepted");
    }
  }
  console.log(`   tasks: created ${created} tasks (owner ${owner.email})`);
}
