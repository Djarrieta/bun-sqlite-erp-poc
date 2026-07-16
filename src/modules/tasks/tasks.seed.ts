import { UserRepository } from "../../auth/auth.db.ts";
import { TaskRepository, type TaskInput } from "./tasks.db.ts";

/**
 * Development seed for the tasks module. Creates a few tasks owned by (and
 * assigned to) the primary dev account so the list isn't empty. Run after
 * `seedUsers`. Idempotent: skips when any tasks already exist for the owner.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

const SEED_TASKS: TaskInput[] = [
  { title: "Llamar a Juan Pérez (ACME)", description: "Dar seguimiento a la cotización.", status: "pending", priority: "high", dueDate: "2026-07-20", assigneeId: null },
  { title: "Preparar propuesta Initech", description: "", status: "in_progress", priority: "medium", dueDate: "", assigneeId: null },
  { title: "Revisar equipo en Planta Norte", description: "Confirmar recepción del traslado.", status: "pending", priority: "low", dueDate: "", assigneeId: null },
];

export function seedTasks(): void {
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.log("   tasks: no owner user found, skipping");
    return;
  }
  const tasks = new TaskRepository();
  if (tasks.list({ userId: owner.id }).total > 0) {
    console.log("   tasks: already seeded, skipping");
    return;
  }
  for (const input of SEED_TASKS)
    tasks.create({ ...input, assigneeId: owner.id }, owner.id);
  console.log(`   tasks: created ${SEED_TASKS.length} tasks`);
}
