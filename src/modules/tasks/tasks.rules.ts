import type { ModulePermissions, Role } from "../../core/permissions.ts";
import { USER_ROLES } from "../users/users.rules.ts";
import type { TaskInput, TaskPriority, TaskStatus } from "./tasks.db.ts";

/** Permission key for this module (used across views and routes). */
export const TASKS_MODULE = "tasks";

/** All valid statuses, in display order. */
export const TASK_STATUSES: readonly TaskStatus[] = [
  "pending",
  "in_progress",
  "done",
  "cancelled",
];

/** All valid priorities, in display order. */
export const TASK_PRIORITIES: readonly TaskPriority[] = [
  "low",
  "medium",
  "high",
];

/**
 * Business rules: every role may fully manage tasks — anyone can create a task
 * and tag any user or role. This module-level matrix is deliberately permissive;
 * the real gate is per-task (row-level): a user only sees and edits tasks they
 * created or were assigned to. Routes enforce that with the repository's
 * `canView` check, not just `can(...)`.
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

/** datetime-local values look like "2026-07-14T09:30" (optionally with seconds). */
const DATETIME_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

function isStatus(value: string): value is TaskStatus {
  return (TASK_STATUSES as readonly string[]).includes(value);
}

function isPriority(value: string): value is TaskPriority {
  return (TASK_PRIORITIES as readonly string[]).includes(value);
}

function isRole(value: string): value is Role {
  return (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Parse and validate the task form. Assignees are cross-checked against the
 * caller-supplied sets of known user ids and roles so a tampered form can never
 * tag a non-existent user or an invalid role. Dates are optional; when both are
 * set the end may not precede the start.
 */
export function parseTaskForm(
  form: FormData,
  validUserIds: ReadonlySet<number>,
  validRoles: ReadonlySet<string> = new Set(USER_ROLES)
): ParsedTaskForm {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const statusRaw = String(form.get("status") ?? "pending");
  const priorityRaw = String(form.get("priority") ?? "medium");
  const startAt = String(form.get("start_at") ?? "").trim();
  const endAt = String(form.get("end_at") ?? "").trim();

  const assigneeUserIds = [
    ...new Set(
      form
        .getAll("assignee_user")
        .map((v) => Number(String(v)))
        .filter((n) => Number.isInteger(n) && validUserIds.has(n))
    ),
  ];
  const assigneeRoles = [
    ...new Set(
      form
        .getAll("assignee_role")
        .map((v) => String(v))
        .filter((v) => validRoles.has(v) && isRole(v))
    ),
  ] as Role[];

  const errors: Record<string, string> = {};
  if (!title) errors.title = "El título es obligatorio.";
  else if (title.length > 160)
    errors.title = "El título no puede superar 160 caracteres.";
  if (description.length > 2000)
    errors.description = "La descripción no puede superar 2000 caracteres.";
  if (!isStatus(statusRaw)) errors.status = "Estado inválido.";
  if (!isPriority(priorityRaw)) errors.priority = "Prioridad inválida.";
  if (startAt && !DATETIME_PATTERN.test(startAt))
    errors.start_at = "Fecha de inicio inválida.";
  if (endAt) {
    if (!DATETIME_PATTERN.test(endAt)) errors.end_at = "Fecha de fin inválida.";
    else if (startAt && endAt < startAt)
      errors.end_at = "El fin no puede ser anterior al inicio.";
  }

  const status: TaskStatus = isStatus(statusRaw) ? statusRaw : "pending";
  const priority: TaskPriority = isPriority(priorityRaw)
    ? priorityRaw
    : "medium";

  return {
    input: {
      title,
      description,
      status,
      priority,
      startAt,
      endAt,
      assigneeUserIds,
      assigneeRoles,
    },
    errors,
  };
}
