/**
 * Reporting catalog: the ONLY tables and columns a report may read, grouped by
 * the permission module that guards them. This is the single source of truth
 * for data visibility in reports:
 *
 *  - `reportableTablesFor(user)` returns the tables the viewer may query, i.e.
 *    the tables of every module where the user has `view`. The read-only SQL
 *    engine rejects any query that touches a table outside this set.
 *  - `schemaContextFor(user)` renders those same tables (with columns) as the
 *    schema description handed to the LLM, so it only ever generates SQL over
 *    data the user is allowed to see.
 *
 * Sensitive data is deliberately absent: `users.password_hash` and the whole
 * `sessions` table are never listed here, and are additionally hard-blocked by
 * `src/core/readonly-sql.ts`.
 */
import { can } from "../../core/permissions.ts";
import type { User } from "../../auth/auth.db.ts";

interface ReportTable {
  /** Permission module that gates this table (must have `view`). */
  module: string;
  /** Physical table name. */
  table: string;
  /** One-line description shown to the LLM. */
  description: string;
  /** Safe columns, in a form useful to the model (with FK hints). */
  columns: string[];
}

/**
 * Trusted, developer-authored table + column allowlist. Adding a table here is
 * what makes it queryable from reports — never expose sensitive columns.
 */
export const REPORT_TABLES: readonly ReportTable[] = [
  {
    module: "items",
    table: "items",
    description: "Catálogo de artículos.",
    columns: [
      "id",
      "name",
      "tags",
      "status ('draft'|'active'|'archived')",
      "is_unique (0|1)",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "locations",
    table: "locations",
    description: "Ubicaciones (bodegas y sitios de proyecto).",
    columns: [
      "id",
      "code",
      "name",
      "kind ('warehouse'|'site')",
      "is_active (0|1)",
      "project_id -> projects.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "inventory",
    table: "inventory",
    description: "Existencias: cantidad de un artículo en una ubicación.",
    columns: [
      "id",
      "item_id -> items.id",
      "location_id -> locations.id",
      "quantity",
      "updated_at",
    ],
  },
  {
    module: "movements",
    table: "movements",
    description: "Movimientos de inventario (traslado/entrada/salida).",
    columns: [
      "id",
      "kind ('transfer'|'intake'|'dispatch')",
      "origin_id -> locations.id",
      "destination_id -> locations.id",
      "status ('draft'|'confirmed'|'cancelled')",
      "notes",
      "created_by -> users.id",
      "created_at",
      "updated_at",
      "confirmed_at",
    ],
  },
  {
    module: "movements",
    table: "movement_lines",
    description: "Renglones de un movimiento: artículo y cantidad.",
    columns: [
      "id",
      "movement_id -> movements.id",
      "item_id -> items.id",
      "quantity",
    ],
  },
  {
    module: "companies",
    table: "companies",
    description: "Compañías del CRM.",
    columns: [
      "id",
      "code",
      "name",
      "industry",
      "website",
      "phone",
      "email",
      "is_active (0|1)",
      "notes",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "contacts",
    table: "contacts",
    description: "Contactos, opcionalmente ligados a una compañía.",
    columns: [
      "id",
      "name",
      "title",
      "email",
      "phone",
      "company_id -> companies.id",
      "is_active (0|1)",
      "notes",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "projects",
    table: "projects",
    description: "Proyectos, cada uno pertenece a una compañía.",
    columns: [
      "id",
      "code",
      "name",
      "company_id -> companies.id",
      "status ('prospect'|'active'|'on_hold'|'done'|'cancelled')",
      "start_date (YYYY-MM-DD)",
      "end_date (YYYY-MM-DD)",
      "description",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "visits",
    table: "visits",
    description: "Visitas registradas (notas/transcripción/resumen).",
    columns: [
      "id",
      "company_id -> companies.id",
      "project_id -> projects.id",
      "source ('web'|'bot')",
      "notes",
      "summary",
      "status ('ready'|'processing')",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "visits",
    table: "visit_action_items",
    description: "Acciones derivadas de una visita.",
    columns: [
      "id",
      "visit_id -> visits.id",
      "text",
      "status ('suggested'|'confirmed')",
      "task_id -> tasks.id",
      "created_at",
    ],
  },
  {
    module: "tasks",
    table: "tasks",
    description: "Tareas con estado, prioridad y responsables.",
    columns: [
      "id",
      "title",
      "description",
      "status ('pending'|'done')",
      "priority ('low'|'medium'|'high')",
      "due_date (YYYY-MM-DD)",
      "assignee_id -> users.id",
      "company_id -> companies.id",
      "project_id -> projects.id",
      "visit_id -> visits.id",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "events",
    table: "events",
    description: "Eventos/citas del calendario.",
    columns: [
      "id",
      "title",
      "description",
      "start_at",
      "end_at",
      "status ('draft'|'published'|'cancelled')",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
  {
    module: "events",
    table: "event_assignments",
    description: "Asignación de un evento a un usuario o rol.",
    columns: [
      "id",
      "event_id -> events.id",
      "kind ('user'|'role')",
      "user_id -> users.id",
      "role",
    ],
  },
  {
    module: "events",
    table: "event_responses",
    description: "Respuesta de un usuario a un evento.",
    columns: [
      "id",
      "event_id -> events.id",
      "user_id -> users.id",
      "response ('accepted'|'declined')",
      "updated_at",
    ],
  },
  {
    module: "users",
    table: "users",
    description: "Usuarios (sin datos sensibles). Útil para unir por created_by.",
    columns: ["id", "email", "role", "created_at"],
  },
  {
    module: "reports",
    table: "reports",
    description: "Reportes guardados (metadatos).",
    columns: [
      "id",
      "title",
      "chart_type",
      "created_by -> users.id",
      "created_at",
      "updated_at",
    ],
  },
];

/** Every table name the reporting layer knows about. */
export const ALL_REPORT_TABLES: readonly string[] = REPORT_TABLES.map(
  (t) => t.table
);

/** Tables the user may query: those of every module where they have `view`. */
export function reportableTablesFor(user: User): string[] {
  return REPORT_TABLES.filter((t) => can(user, t.module, "view")).map(
    (t) => t.table
  );
}

/**
 * The schema description for the LLM: only the tables the user may read. Empty
 * string when the user can see nothing (the route should refuse to generate).
 */
export function schemaContextFor(user: User): string {
  const lines = REPORT_TABLES.filter((t) => can(user, t.module, "view")).map(
    (t) => `- ${t.table}(${t.columns.join(", ")}): ${t.description}`
  );
  return lines.join("\n");
}
