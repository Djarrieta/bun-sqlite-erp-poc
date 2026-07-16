import type { ModulePermissions } from "../../core/permissions.ts";
import { USER_ROLES } from "../users/users.rules.ts";
import type { TaskInput, TaskPriority, TaskStatus } from "./tasks.db.ts";

/** Permission key for this module (used across views and routes). */
export const TASKS_MODULE = "tasks";

/** All valid statuses, in display order. */
export const TASK_STATUSES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "done",
];

/** All valid priorities, in display order. */
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "medium",
  "high",
];

/**
 * Business rules: every role may fully manage tasks — anyone can create a task
 * and assign it. This module-level matrix is deliberately permissive; the real
 * gate is per-task (row-level): a user only sees and edits tasks they created
 * or were assigned to. Routes enforce that with the repository's `canView`.
 */
const FULL: readonly ["view", "create", "read", "update", "delete"] = [
  "view",
  "create",
  "read",
  "update",
  "delete",
];
export const TASK_PERMISSIONS: ModulePermissions = Object.fromEntries(
  USER_ROLES.map((role) => [role, [...FULL]])
);

export interface ParsedTaskForm {
  input: TaskInput;
  errors: Record<string, string>;
}

/** date input values look like "2026-07-14". */
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function isStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

/**
 * Parse and validate the task form. The assignee (when supplied) is cross-checked
 * against the caller-supplied set of known user ids so a tampered form can never
 * assign a non-existent user.
 */
export function parseTaskForm(
  form: FormData,
  validUserIds: ReadonlySet<number>
): ParsedTaskForm {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const statusRaw = String(form.get("status") ?? "pending");
  const priorityRaw = String(form.get("priority") ?? "medium");
  const dueDate = String(form.get("due_date") ?? "").trim();
  const assigneeRaw = String(form.get("assignee_id") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!title) errors.title = "El título es obligatorio.";
  else if (title.length > 160)
    errors.title = "El título no puede superar 160 caracteres.";
  if (description.length > 2000)
    errors.description = "La descripción no puede superar 2000 caracteres.";
  if (!isStatus(statusRaw)) errors.status = "Estado inválido.";
  if (!isPriority(priorityRaw)) errors.priority = "Prioridad inválida.";
  if (dueDate && !DATE_PATTERN.test(dueDate))
    errors.due_date = "Fecha límite inválida.";

  let assigneeId: number | null = null;
  if (assigneeRaw) {
    const n = Number(assigneeRaw);
    if (Number.isInteger(n) && validUserIds.has(n)) assigneeId = n;
    else errors.assignee_id = "El usuario asignado no existe.";
  }

  const status: TaskStatus = isStatus(statusRaw) ? statusRaw : "pending";
  const priority: TaskPriority = isPriority(priorityRaw)
    ? priorityRaw
    : "medium";

  return {
    input: { title, description, status, priority, dueDate, assigneeId },
    errors,
  };
}
