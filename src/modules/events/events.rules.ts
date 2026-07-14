import type { ModulePermissions, Role } from "../../core/permissions.ts";
import { USER_ROLES } from "../users/users.rules.ts";
import type { EventInput, EventStatus } from "./events.db.ts";

/** Permission key for this module (used across views and routes). */
export const EVENTS_MODULE = "events";

/** All valid statuses, in display order. */
export const EVENT_STATUSES: readonly EventStatus[] = [
  "draft",
  "scheduled",
  "done",
  "cancelled",
];

/**
 * Business rules: every role may fully manage events — anyone can create an
 * event and tag any user or role. Note this module-level matrix is deliberately
 * permissive; the real gate is per-event (row-level): a user only sees and edits
 * events they created or were assigned to. Routes enforce that with the
 * repository's `canView` check, not just `can(...)`.
 */
const FULL: readonly ["view", "create", "read", "update", "delete"] = [
  "view",
  "create",
  "read",
  "update",
  "delete",
];
export const EVENT_PERMISSIONS: ModulePermissions = Object.fromEntries(
  USER_ROLES.map((role) => [role, [...FULL]])
);

/** datetime-local values look like "2026-07-14T09:30" (optionally with seconds). */
const DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export interface ParsedEventForm {
  input: EventInput;
  errors: Record<string, string>;
}

function isStatus(value: string): value is EventStatus {
  return (EVENT_STATUSES as readonly string[]).includes(value);
}

function isRole(value: string): value is Role {
  return (USER_ROLES as readonly string[]).includes(value);
}

/**
 * Parse and validate the event form. Assignees are cross-checked against the
 * caller-supplied sets of known user ids and roles so a tampered form can never
 * tag a non-existent user or an invalid role.
 */
export function parseEventForm(
  form: FormData,
  validUserIds: ReadonlySet<number>,
  validRoles: ReadonlySet<string> = new Set(USER_ROLES)
): ParsedEventForm {
  const title = String(form.get("title") ?? "").trim();
  const description = String(form.get("description") ?? "").trim();
  const startAt = String(form.get("start_at") ?? "").trim();
  const endAt = String(form.get("end_at") ?? "").trim();
  const statusRaw = String(form.get("status") ?? "draft");

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
  else if (title.length > 200)
    errors.title = "El título no puede superar 200 caracteres.";
  if (description.length > 2000)
    errors.description = "La descripción es demasiado larga (máximo 2000).";
  if (!startAt) errors.start_at = "La fecha de inicio es obligatoria.";
  else if (!DATETIME_RE.test(startAt))
    errors.start_at = "Fecha de inicio inválida.";
  if (endAt) {
    if (!DATETIME_RE.test(endAt)) errors.end_at = "Fecha de fin inválida.";
    else if (startAt && endAt < startAt)
      errors.end_at = "El fin no puede ser anterior al inicio.";
  }
  if (!isStatus(statusRaw)) errors.status = "Estado inválido.";

  const status: EventStatus = isStatus(statusRaw) ? statusRaw : "draft";
  return {
    input: {
      title,
      description,
      startAt,
      endAt,
      status,
      assigneeUserIds,
      assigneeRoles,
    },
    errors,
  };
}
