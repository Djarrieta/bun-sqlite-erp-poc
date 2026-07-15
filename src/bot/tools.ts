/**
 * Bot tool layer: the bridge between the LLM's function calls and the app's
 * repositories. Every tool maps to a permission (`module` + `action`) and is
 * enforced twice — the agent only advertises tools the user's role allows, and
 * each handler re-checks `can()` (plus row-level `canView()` for events).
 *
 * SECURITY: handlers only ever pass values as *bound* parameters through the
 * repositories (which use `?` placeholders). LLM output never reaches the raw,
 * interpolated structural fields of `paginate()` (from/select/where/orderBy).
 *
 * Mutating tools support a `dryRun` mode: it validates the args and returns a
 * human-readable preview *without writing*, which the agent uses to ask the
 * user to confirm before the real write.
 */
import { can, type Action, type Role } from "../core/permissions.ts";
import type { User } from "../auth/auth.db.ts";
import { UserRepository } from "../auth/auth.db.ts";
import {
  ItemRepository,
  parseTags,
  type Item,
} from "../modules/items/items.db.ts";
import { parseItemForm, ITEMS_MODULE } from "../modules/items/items.rules.ts";
import {
  LocationRepository,
  type Location,
} from "../modules/locations/locations.db.ts";
import {
  parseLocationForm,
  LOCATIONS_MODULE,
} from "../modules/locations/locations.rules.ts";
import { InventoryRepository } from "../modules/inventory/inventory.db.ts";
import { INVENTORY_MODULE } from "../modules/inventory/inventory.rules.ts";
import { MovementRepository } from "../modules/movements/movements.db.ts";
import { MOVEMENTS_MODULE } from "../modules/movements/movements.rules.ts";
import { EventRepository, type Event } from "../modules/events/events.db.ts";
import { parseEventForm, EVENTS_MODULE } from "../modules/events/events.rules.ts";
import { USERS_MODULE } from "../modules/users/users.rules.ts";

// --- Tool shape --------------------------------------------------------------

/** OpenAI function-calling tool spec (also understood by DeepSeek). */
export interface ToolSpec {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export type ToolArgs = Record<string, unknown>;

export interface BotTool {
  spec: ToolSpec;
  /** Permission module key this tool belongs to. */
  module: string;
  /** Permission action required to use it. */
  action: Action;
  /** Whether the tool writes (needs user confirmation). */
  mutating: boolean;
  /**
   * Execute the tool. For mutating tools, `dryRun === true` validates and
   * returns a confirmation preview *without writing*.
   */
  run(args: ToolArgs, user: User, dryRun: boolean): string;
}

// --- Shared repositories (same singleton connection as the web app) ----------

const items = new ItemRepository();
const locations = new LocationRepository();
const inventory = new InventoryRepository();
const movements = new MovementRepository();
const events = new EventRepository();
const usersRepo = new UserRepository();

// --- Small coercion/validation helpers ---------------------------------------

function assertCan(user: User, module: string, action: Action): void {
  if (!can(user, module, action))
    throw new Error("No tienes permiso para realizar esta acción.");
}

function throwIfErrors(errors: Record<string, string>): void {
  const list = Object.values(errors);
  if (list.length) throw new Error(list.join(" "));
}

function optStr(v: unknown): string | undefined {
  if (v == null) return undefined;
  const s = String(v).trim();
  return s === "" ? undefined : s;
}

function optNum(v: unknown): number | undefined {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

function reqId(v: unknown): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw new Error("Falta un id válido.");
  return n;
}

function strArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
  if (typeof v === "string")
    return v
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
}

function bool(v: unknown, dflt = false): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string")
    return ["1", "true", "sí", "si", "yes", "y"].includes(v.toLowerCase());
  return dflt;
}

// --- FormData adapters: reuse each module's real validator --------------------

function itemInputFrom(args: ToolArgs, base?: Item) {
  const fd = new FormData();
  fd.set("name", args.name != null ? String(args.name) : base?.name ?? "");
  const tags =
    args.tags != null ? strArray(args.tags) : base ? parseTags(base.tags) : [];
  fd.set("tags", tags.join(","));
  fd.set(
    "status",
    args.status != null ? String(args.status) : base?.status ?? "draft"
  );
  const isUnique =
    args.isUnique != null ? bool(args.isUnique) : base ? base.is_unique === 1 : false;
  fd.set("is_unique", isUnique ? "1" : "0");
  return parseItemForm(fd);
}

function locationInputFrom(args: ToolArgs, base?: Location) {
  const fd = new FormData();
  fd.set("code", args.code != null ? String(args.code) : base?.code ?? "");
  fd.set("name", args.name != null ? String(args.name) : base?.name ?? "");
  fd.set("kind", args.kind != null ? String(args.kind) : base?.kind ?? "warehouse");
  const isActive =
    args.isActive != null ? bool(args.isActive) : base ? base.is_active === 1 : true;
  fd.set("is_active", isActive ? "1" : "0");
  return parseLocationForm(fd);
}

function eventInputFrom(
  args: ToolArgs,
  base?: { event: Event; users: number[]; roles: Role[] }
) {
  const fd = new FormData();
  fd.set("title", args.title != null ? String(args.title) : base?.event.title ?? "");
  fd.set(
    "description",
    args.description != null ? String(args.description) : base?.event.description ?? ""
  );
  fd.set(
    "start_at",
    args.startAt != null ? String(args.startAt) : base?.event.start_at ?? ""
  );
  fd.set("end_at", args.endAt != null ? String(args.endAt) : base?.event.end_at ?? "");
  fd.set(
    "status",
    args.status != null ? String(args.status) : base?.event.status ?? "draft"
  );
  const userIds =
    args.assigneeUserIds != null
      ? strArray(args.assigneeUserIds)
      : (base?.users ?? []).map(String);
  for (const id of userIds) fd.append("assignee_user", id);
  const roles =
    args.assigneeRoles != null
      ? strArray(args.assigneeRoles)
      : (base?.roles ?? []).map(String);
  for (const r of roles) fd.append("assignee_role", r);
  const validUserIds = new Set(usersRepo.list().map((u) => u.id));
  return parseEventForm(fd, validUserIds);
}

// --- Tool catalog ------------------------------------------------------------

export const BOT_TOOLS: BotTool[] = [
  // --- Items: read ---
  {
    module: ITEMS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_items",
        description:
          "Lista artículos del catálogo con búsqueda y filtros. Devuelve una página (rows, total, page, pageSize).",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por nombre." },
            status: {
              type: "string",
              enum: ["draft", "active", "archived"],
              description: "Filtro por estado.",
            },
            tags: {
              type: "array",
              items: { type: "string" },
              description: "Filtra por etiquetas (coincide cualquiera).",
            },
            page: { type: "integer", description: "Página (empieza en 1)." },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, ITEMS_MODULE, "view");
      return JSON.stringify(
        items.list({
          q: optStr(args.q),
          status: optStr(args.status),
          tags: args.tags != null ? strArray(args.tags) : undefined,
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: ITEMS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_item",
        description: "Obtiene un artículo por su id.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer", description: "Id del artículo." } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, ITEMS_MODULE, "read");
      return JSON.stringify(
        items.get(reqId(args.id)) ?? { error: "Artículo no encontrado." }
      );
    },
  },
  // --- Items: write ---
  {
    module: ITEMS_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_item",
        description: "Crea un artículo nuevo en el catálogo.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string", description: "Nombre del artículo." },
            tags: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["draft", "active", "archived"] },
            isUnique: {
              type: "boolean",
              description: "Artículo serializado / único (máx. 1 unidad).",
            },
          },
          required: ["name"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, ITEMS_MODULE, "create");
      const { input, errors } = itemInputFrom(args);
      throwIfErrors(errors);
      if (dryRun)
        return `Crear artículo: nombre="${input.name}", estado="${input.status}", etiquetas=[${input.tags.join(
          ", "
        )}], único=${input.isUnique ? "sí" : "no"}.`;
      const created = items.create(input, user.id);
      return `Artículo #${created.id} creado ("${created.name}").`;
    },
  },
  {
    module: ITEMS_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_item",
        description:
          "Actualiza un artículo existente. Solo cambia los campos que envíes; el resto se conserva.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            tags: { type: "array", items: { type: "string" } },
            status: { type: "string", enum: ["draft", "active", "archived"] },
            isUnique: { type: "boolean" },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, ITEMS_MODULE, "update");
      const id = reqId(args.id);
      const existing = items.get(id);
      if (!existing) throw new Error("Artículo no encontrado.");
      const { input, errors } = itemInputFrom(args, existing);
      throwIfErrors(errors);
      if (dryRun)
        return `Actualizar artículo #${id}: nombre="${input.name}", estado="${input.status}", etiquetas=[${input.tags.join(
          ", "
        )}], único=${input.isUnique ? "sí" : "no"}.`;
      return items.update(id, input)
        ? `Artículo #${id} actualizado.`
        : "No se pudo actualizar el artículo.";
    },
  },
  {
    module: ITEMS_MODULE,
    action: "delete",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "delete_item",
        description:
          "Archiva un artículo (los artículos nunca se borran físicamente, se archivan).",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, ITEMS_MODULE, "delete");
      const id = reqId(args.id);
      const existing = items.get(id);
      if (!existing) throw new Error("Artículo no encontrado.");
      if (dryRun)
        return `Archivar artículo #${id} ("${existing.name}"). Quedará como "archived".`;
      return items.archive(id)
        ? `Artículo #${id} archivado.`
        : "No se pudo archivar el artículo.";
    },
  },
  // --- Locations: read ---
  {
    module: LOCATIONS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_locations",
        description: "Lista ubicaciones con búsqueda y filtros. Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por código o nombre." },
            kind: {
              type: "string",
              enum: ["warehouse", "store", "transit"],
            },
            active: { type: "string", enum: ["1", "0"], description: "1 activas, 0 archivadas." },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, LOCATIONS_MODULE, "view");
      return JSON.stringify(
        locations.list({
          q: optStr(args.q),
          kind: optStr(args.kind),
          active: optStr(args.active),
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: LOCATIONS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_location",
        description: "Obtiene una ubicación por su id.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, LOCATIONS_MODULE, "read");
      return JSON.stringify(
        locations.get(reqId(args.id)) ?? { error: "Ubicación no encontrada." }
      );
    },
  },
  // --- Locations: write ---
  {
    module: LOCATIONS_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_location",
        description: "Crea una ubicación nueva.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Código único (ej. WH-01)." },
            name: { type: "string" },
            kind: { type: "string", enum: ["warehouse", "store", "transit"] },
            isActive: { type: "boolean" },
          },
          required: ["code", "name"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, LOCATIONS_MODULE, "create");
      const { input, errors } = locationInputFrom(args);
      throwIfErrors(errors);
      if (dryRun)
        return `Crear ubicación: código="${input.code}", nombre="${input.name}", tipo="${input.kind}", activa=${input.isActive ? "sí" : "no"}.`;
      const created = locations.create(input);
      return `Ubicación #${created.id} creada ("${created.code}").`;
    },
  },
  {
    module: LOCATIONS_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_location",
        description:
          "Actualiza una ubicación existente. Solo cambia los campos que envíes.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            code: { type: "string" },
            name: { type: "string" },
            kind: { type: "string", enum: ["warehouse", "store", "transit"] },
            isActive: { type: "boolean" },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, LOCATIONS_MODULE, "update");
      const id = reqId(args.id);
      const existing = locations.get(id);
      if (!existing) throw new Error("Ubicación no encontrada.");
      const { input, errors } = locationInputFrom(args, existing);
      throwIfErrors(errors);
      if (dryRun)
        return `Actualizar ubicación #${id}: código="${input.code}", nombre="${input.name}", tipo="${input.kind}", activa=${input.isActive ? "sí" : "no"}.`;
      return locations.update(id, input)
        ? `Ubicación #${id} actualizada.`
        : "No se pudo actualizar la ubicación.";
    },
  },
  {
    module: LOCATIONS_MODULE,
    action: "delete",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "delete_location",
        description:
          "Archiva una ubicación (la marca como inactiva; no se borra físicamente).",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, LOCATIONS_MODULE, "delete");
      const id = reqId(args.id);
      const existing = locations.get(id);
      if (!existing) throw new Error("Ubicación no encontrada.");
      if (dryRun)
        return `Archivar ubicación #${id} ("${existing.code} · ${existing.name}"). Se marcará como inactiva.`;
      return locations.update(id, {
        code: existing.code,
        name: existing.name,
        kind: existing.kind,
        isActive: false,
      })
        ? `Ubicación #${id} archivada (inactiva).`
        : "No se pudo archivar la ubicación.";
    },
  },
  // --- Events: read (row-level scoped) ---
  {
    module: EVENTS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_events",
        description:
          "Lista los eventos que el usuario puede ver (creados por él o donde está asignado). Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por título o descripción." },
            status: {
              type: "string",
              enum: ["draft", "scheduled", "done", "cancelled"],
            },
            scope: {
              type: "string",
              enum: ["created", "assigned"],
              description: "Limita a los creados por mí o los asignados a mí.",
            },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, EVENTS_MODULE, "view");
      return JSON.stringify(
        events.list({
          userId: user.id,
          role: user.role,
          q: optStr(args.q),
          status: optStr(args.status),
          scope: optStr(args.scope),
        })
      );
    },
  },
  {
    module: EVENTS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_event",
        description: "Obtiene un evento por su id (solo si el usuario puede verlo).",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, EVENTS_MODULE, "read");
      const id = reqId(args.id);
      if (!events.canView(user.id, user.role, id))
        return JSON.stringify({ error: "Evento no encontrado o sin acceso." });
      const event = events.get(id);
      if (!event) return JSON.stringify({ error: "Evento no encontrado." });
      return JSON.stringify({
        ...event,
        assigneeUsers: events.assigneeUsers(id),
        assigneeRoles: events.assigneeRoles(id),
      });
    },
  },
  // --- Events: write (row-level scoped) ---
  {
    module: EVENTS_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_event",
        description:
          "Crea un evento. Las fechas usan formato 'YYYY-MM-DDTHH:MM'. Puedes asignarlo a usuarios (ids) y/o roles.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            startAt: { type: "string", description: "Inicio, ej. 2026-07-20T09:30." },
            endAt: { type: "string", description: "Fin opcional, mismo formato." },
            status: {
              type: "string",
              enum: ["draft", "scheduled", "done", "cancelled"],
            },
            assigneeUserIds: { type: "array", items: { type: "integer" } },
            assigneeRoles: {
              type: "array",
              items: {
                type: "string",
                enum: [
                  "admin",
                  "sales",
                  "financial",
                  "engineer",
                  "logistic",
                  "member",
                ],
              },
            },
          },
          required: ["title", "startAt"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, EVENTS_MODULE, "create");
      const { input, errors } = eventInputFrom(args);
      throwIfErrors(errors);
      if (dryRun)
        return `Crear evento: título="${input.title}", inicio=${input.startAt}${
          input.endAt ? `, fin=${input.endAt}` : ""
        }, estado="${input.status}", usuarios=[${input.assigneeUserIds.join(
          ", "
        )}], roles=[${input.assigneeRoles.join(", ")}].`;
      const created = events.create(input, user.id);
      return `Evento #${created.id} creado ("${created.title}").`;
    },
  },
  {
    module: EVENTS_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_event",
        description:
          "Actualiza un evento que el usuario pueda ver. Solo cambia los campos que envíes.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            description: { type: "string" },
            startAt: { type: "string" },
            endAt: { type: "string" },
            status: {
              type: "string",
              enum: ["draft", "scheduled", "done", "cancelled"],
            },
            assigneeUserIds: { type: "array", items: { type: "integer" } },
            assigneeRoles: { type: "array", items: { type: "string" } },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, EVENTS_MODULE, "update");
      const id = reqId(args.id);
      if (!events.canView(user.id, user.role, id))
        throw new Error("Evento no encontrado o sin acceso.");
      const existing = events.get(id);
      if (!existing) throw new Error("Evento no encontrado.");
      const { input, errors } = eventInputFrom(args, {
        event: existing,
        users: events.assigneeUsers(id).map((u) => u.id),
        roles: events.assigneeRoles(id),
      });
      throwIfErrors(errors);
      if (dryRun)
        return `Actualizar evento #${id}: título="${input.title}", inicio=${input.startAt}, estado="${input.status}".`;
      return events.update(id, input)
        ? `Evento #${id} actualizado.`
        : "No se pudo actualizar el evento.";
    },
  },
  {
    module: EVENTS_MODULE,
    action: "delete",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "delete_event",
        description:
          "Elimina un evento que el usuario pueda ver. Esta acción es permanente.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, EVENTS_MODULE, "delete");
      const id = reqId(args.id);
      if (!events.canView(user.id, user.role, id))
        throw new Error("Evento no encontrado o sin acceso.");
      const existing = events.get(id);
      if (!existing) throw new Error("Evento no encontrado.");
      if (dryRun)
        return `Eliminar evento #${id} ("${existing.title}"). Esta acción es permanente.`;
      events.delete(id);
      return `Evento #${id} eliminado.`;
    },
  },
  // --- Inventory: read only ---
  {
    module: INVENTORY_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_inventory",
        description:
          "Lista los saldos de inventario (cantidad por artículo y ubicación). Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por artículo o ubicación." },
            locationId: { type: "integer", description: "Filtra por ubicación." },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, INVENTORY_MODULE, "view");
      return JSON.stringify(
        inventory.list({
          q: optStr(args.q),
          locationId: optNum(args.locationId),
          page: optNum(args.page),
        })
      );
    },
  },
  // --- Movements: read only ---
  {
    module: MOVEMENTS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_movements",
        description: "Lista movimientos de stock con filtros. Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string" },
            kind: { type: "string", enum: ["intake", "transfer", "dispatch"] },
            status: { type: "string", enum: ["draft", "confirmed"] },
            locationId: { type: "integer" },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, MOVEMENTS_MODULE, "view");
      return JSON.stringify(
        movements.list({
          q: optStr(args.q),
          kind: optStr(args.kind),
          status: optStr(args.status),
          locationId: optNum(args.locationId),
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: MOVEMENTS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_movement",
        description: "Obtiene un movimiento por id, con sus líneas.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, MOVEMENTS_MODULE, "read");
      const id = reqId(args.id);
      const movement = movements.get(id);
      if (!movement) return JSON.stringify({ error: "Movimiento no encontrado." });
      return JSON.stringify({ ...movement, lines: movements.listLines(id) });
    },
  },
  // --- Users: read only (admin) ---
  {
    module: USERS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_users",
        description:
          "Lista los usuarios (id, correo, rol y vínculo de Telegram). Solo administradores.",
        parameters: { type: "object", properties: {}, required: [] },
      },
    },
    run: (_args, user) => {
      assertCan(user, USERS_MODULE, "view");
      return JSON.stringify(
        usersRepo.list().map((u) => ({
          id: u.id,
          email: u.email,
          role: u.role,
          telegram_id: u.telegram_id,
        }))
      );
    },
  },
];

// --- Lookups the agent uses --------------------------------------------------

export const TOOLS_BY_NAME: ReadonlyMap<string, BotTool> = new Map(
  BOT_TOOLS.map((t) => [t.spec.function.name, t])
);

/** OpenAI-format specs for exactly the tools this user's role may use. */
export function toolSpecsFor(user: User): ToolSpec[] {
  return BOT_TOOLS.filter((t) => can(user, t.module, t.action)).map((t) => t.spec);
}

/** Names of the tools available to this user (for the system prompt). */
export function availableToolNames(user: User): string[] {
  return BOT_TOOLS.filter((t) => can(user, t.module, t.action)).map(
    (t) => t.spec.function.name
  );
}
