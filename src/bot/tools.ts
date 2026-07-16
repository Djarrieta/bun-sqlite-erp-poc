/**
 * Bot tool layer: the bridge between the LLM's function calls and the app's
 * repositories. Every tool maps to a permission (`module` + `action`) and is
 * enforced twice — the agent only advertises tools the user's role allows, and
 * each handler re-checks `can()` (plus row-level `canView()` for row-scoped
 * modules like tasks).
 *
 * SECURITY: handlers only ever pass values as *bound* parameters through the
 * repositories (which use `?` placeholders). LLM output never reaches the raw,
 * interpolated structural fields of `paginate()` (from/select/where/orderBy).
 *
 * Mutating tools support a `dryRun` mode: it validates the args and returns a
 * human-readable preview *without writing*, which the agent uses to ask the
 * user to confirm before the real write.
 */
import { can, type Action } from "../core/permissions.ts";
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
import {
  CompanyRepository,
  type Company,
} from "../modules/companies/companies.db.ts";
import {
  parseCompanyForm,
  COMPANIES_MODULE,
} from "../modules/companies/companies.rules.ts";
import {
  ContactRepository,
  type Contact,
} from "../modules/contacts/contacts.db.ts";
import {
  parseContactForm,
  CONTACTS_MODULE,
} from "../modules/contacts/contacts.rules.ts";
import {
  ProjectRepository,
  type Project,
} from "../modules/projects/projects.db.ts";
import {
  parseProjectForm,
  PROJECTS_MODULE,
} from "../modules/projects/projects.rules.ts";
import { TaskRepository, type Task } from "../modules/tasks/tasks.db.ts";
import { parseTaskForm, TASKS_MODULE } from "../modules/tasks/tasks.rules.ts";
import { VisitRepository } from "../modules/visits/visits.db.ts";
import { VISITS_MODULE } from "../modules/visits/visits.rules.ts";
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
const companies = new CompanyRepository();
const contacts = new ContactRepository();
const projects = new ProjectRepository();
const tasks = new TaskRepository();
const visits = new VisitRepository();
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

function companyInputFrom(args: ToolArgs, base?: Company) {
  const fd = new FormData();
  fd.set("code", args.code != null ? String(args.code) : base?.code ?? "");
  fd.set("name", args.name != null ? String(args.name) : base?.name ?? "");
  fd.set(
    "industry",
    args.industry != null ? String(args.industry) : base?.industry ?? ""
  );
  fd.set(
    "website",
    args.website != null ? String(args.website) : base?.website ?? ""
  );
  fd.set("phone", args.phone != null ? String(args.phone) : base?.phone ?? "");
  fd.set("email", args.email != null ? String(args.email) : base?.email ?? "");
  const isActive =
    args.isActive != null ? bool(args.isActive) : base ? base.is_active === 1 : true;
  fd.set("is_active", isActive ? "1" : "0");
  fd.set("notes", args.notes != null ? String(args.notes) : base?.notes ?? "");
  return parseCompanyForm(fd);
}

function contactInputFrom(args: ToolArgs, base?: Contact) {
  const fd = new FormData();
  fd.set("name", args.name != null ? String(args.name) : base?.name ?? "");
  fd.set("title", args.title != null ? String(args.title) : base?.title ?? "");
  fd.set("email", args.email != null ? String(args.email) : base?.email ?? "");
  fd.set("phone", args.phone != null ? String(args.phone) : base?.phone ?? "");
  const companyId =
    args.companyId != null
      ? String(args.companyId)
      : base?.company_id != null
        ? String(base.company_id)
        : "";
  fd.set("company_id", companyId);
  const isActive =
    args.isActive != null ? bool(args.isActive) : base ? base.is_active === 1 : true;
  fd.set("is_active", isActive ? "1" : "0");
  fd.set("notes", args.notes != null ? String(args.notes) : base?.notes ?? "");
  return parseContactForm(fd);
}

function projectInputFrom(args: ToolArgs, base?: Project) {
  const fd = new FormData();
  fd.set("code", args.code != null ? String(args.code) : base?.code ?? "");
  fd.set("name", args.name != null ? String(args.name) : base?.name ?? "");
  const companyId =
    args.companyId != null
      ? String(args.companyId)
      : base?.company_id != null
        ? String(base.company_id)
        : "";
  fd.set("company_id", companyId);
  fd.set(
    "status",
    args.status != null ? String(args.status) : base?.status ?? "prospect"
  );
  fd.set(
    "start_date",
    args.startDate != null ? String(args.startDate) : base?.start_date ?? ""
  );
  fd.set(
    "end_date",
    args.endDate != null ? String(args.endDate) : base?.end_date ?? ""
  );
  fd.set(
    "description",
    args.description != null ? String(args.description) : base?.description ?? ""
  );
  return parseProjectForm(fd);
}

function taskInputFrom(args: ToolArgs, base?: Task) {
  const fd = new FormData();
  fd.set("title", args.title != null ? String(args.title) : base?.title ?? "");
  fd.set(
    "description",
    args.description != null ? String(args.description) : base?.description ?? ""
  );
  fd.set(
    "status",
    args.status != null ? String(args.status) : base?.status ?? "pending"
  );
  fd.set(
    "priority",
    args.priority != null ? String(args.priority) : base?.priority ?? "medium"
  );
  fd.set(
    "start_at",
    args.startAt != null ? String(args.startAt) : base?.start_at ?? ""
  );
  fd.set("end_at", args.endAt != null ? String(args.endAt) : base?.end_at ?? "");
  const userIds =
    args.assigneeUserIds != null
      ? strArray(args.assigneeUserIds)
      : base
        ? tasks.assigneeUsers(base.id).map((u) => String(u.id))
        : [];
  for (const id of userIds) fd.append("assignee_user", id);
  const roles =
    args.assigneeRoles != null
      ? strArray(args.assigneeRoles)
      : base
        ? tasks.assigneeRoles(base.id).map(String)
        : [];
  for (const r of roles) fd.append("assignee_role", r);
  const validUserIds = new Set(usersRepo.list().map((u) => u.id));
  return parseTaskForm(fd, validUserIds);
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
  // --- Companies: read ---
  {
    module: COMPANIES_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_companies",
        description:
          "Lista compañías del CRM con búsqueda y filtro por estado. Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por código, nombre o industria." },
            active: { type: "string", enum: ["1", "0"], description: "1 activas, 0 archivadas." },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, COMPANIES_MODULE, "view");
      return JSON.stringify(
        companies.list({ q: optStr(args.q), active: optStr(args.active), page: optNum(args.page) })
      );
    },
  },
  {
    module: COMPANIES_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_company",
        description: "Obtiene una compañía por su id.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, COMPANIES_MODULE, "read");
      return JSON.stringify(
        companies.get(reqId(args.id)) ?? { error: "Compañía no encontrada." }
      );
    },
  },
  // --- Companies: write ---
  {
    module: COMPANIES_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_company",
        description: "Crea una compañía nueva en el CRM.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Código único (ej. ACME)." },
            name: { type: "string" },
            industry: { type: "string" },
            website: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            isActive: { type: "boolean" },
            notes: { type: "string" },
          },
          required: ["code", "name"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, COMPANIES_MODULE, "create");
      const { input, errors } = companyInputFrom(args);
      throwIfErrors(errors);
      if (companies.getByCode(input.code))
        throw new Error("Ya existe una compañía con ese código.");
      if (dryRun)
        return `Crear compañía: código="${input.code}", nombre="${input.name}".`;
      const created = companies.create(input, user.id);
      return `Compañía #${created.id} creada ("${created.code}").`;
    },
  },
  {
    module: COMPANIES_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_company",
        description:
          "Actualiza una compañía existente. Solo cambia los campos que envíes.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            code: { type: "string" },
            name: { type: "string" },
            industry: { type: "string" },
            website: { type: "string" },
            phone: { type: "string" },
            email: { type: "string" },
            isActive: { type: "boolean" },
            notes: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, COMPANIES_MODULE, "update");
      const id = reqId(args.id);
      const existing = companies.get(id);
      if (!existing) throw new Error("Compañía no encontrada.");
      const { input, errors } = companyInputFrom(args, existing);
      throwIfErrors(errors);
      const clash = companies.getByCode(input.code);
      if (clash && clash.id !== id)
        throw new Error("Ya existe una compañía con ese código.");
      if (dryRun)
        return `Actualizar compañía #${id}: código="${input.code}", nombre="${input.name}".`;
      return companies.update(id, input)
        ? `Compañía #${id} actualizada.`
        : "No se pudo actualizar la compañía.";
    },
  },
  // --- Contacts: read ---
  {
    module: CONTACTS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_contacts",
        description:
          "Lista contactos del CRM con búsqueda y filtros. Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por nombre, correo o teléfono." },
            active: { type: "string", enum: ["1", "0"] },
            companyId: { type: "integer", description: "Filtra por compañía." },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, CONTACTS_MODULE, "view");
      return JSON.stringify(
        contacts.list({
          q: optStr(args.q),
          active: optStr(args.active),
          companyId: optNum(args.companyId),
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: CONTACTS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_contact",
        description: "Obtiene un contacto por su id.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, CONTACTS_MODULE, "read");
      return JSON.stringify(
        contacts.get(reqId(args.id)) ?? { error: "Contacto no encontrado." }
      );
    },
  },
  // --- Contacts: write ---
  {
    module: CONTACTS_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_contact",
        description:
          "Crea un contacto. La compañía es opcional; si se indica, debe existir.",
        parameters: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string", description: "Cargo o puesto." },
            email: { type: "string" },
            phone: { type: "string" },
            companyId: { type: "integer", description: "Id de la compañía (opcional)." },
            isActive: { type: "boolean" },
            notes: { type: "string" },
          },
          required: ["name"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, CONTACTS_MODULE, "create");
      const { input, errors } = contactInputFrom(args);
      throwIfErrors(errors);
      if (input.companyId && !companies.get(input.companyId))
        throw new Error("La compañía seleccionada no existe.");
      if (dryRun) return `Crear contacto: nombre="${input.name}".`;
      const created = contacts.create(input, user.id);
      return `Contacto #${created.id} creado ("${created.name}").`;
    },
  },
  {
    module: CONTACTS_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_contact",
        description:
          "Actualiza un contacto existente. Solo cambia los campos que envíes.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            name: { type: "string" },
            title: { type: "string" },
            email: { type: "string" },
            phone: { type: "string" },
            companyId: { type: "integer" },
            isActive: { type: "boolean" },
            notes: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, CONTACTS_MODULE, "update");
      const id = reqId(args.id);
      const existing = contacts.get(id);
      if (!existing) throw new Error("Contacto no encontrado.");
      const { input, errors } = contactInputFrom(args, existing);
      throwIfErrors(errors);
      if (input.companyId && !companies.get(input.companyId))
        throw new Error("La compañía seleccionada no existe.");
      if (dryRun) return `Actualizar contacto #${id}: nombre="${input.name}".`;
      return contacts.update(id, input)
        ? `Contacto #${id} actualizado.`
        : "No se pudo actualizar el contacto.";
    },
  },
  // --- Projects: read ---
  {
    module: PROJECTS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_projects",
        description:
          "Lista proyectos del CRM con búsqueda y filtros. Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por código, nombre o compañía." },
            status: {
              type: "string",
              enum: ["prospect", "active", "on_hold", "done", "cancelled"],
            },
            companyId: { type: "integer", description: "Filtra por compañía." },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, PROJECTS_MODULE, "view");
      return JSON.stringify(
        projects.list({
          q: optStr(args.q),
          status: optStr(args.status),
          companyId: optNum(args.companyId),
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: PROJECTS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_project",
        description: "Obtiene un proyecto por su id.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, PROJECTS_MODULE, "read");
      return JSON.stringify(
        projects.get(reqId(args.id)) ?? { error: "Proyecto no encontrado." }
      );
    },
  },
  // --- Projects: write ---
  {
    module: PROJECTS_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_project",
        description:
          "Crea un proyecto. Requiere una compañía existente (companyId). Fechas 'YYYY-MM-DD'.",
        parameters: {
          type: "object",
          properties: {
            code: { type: "string", description: "Código único (ej. PRJ-01)." },
            name: { type: "string" },
            companyId: { type: "integer", description: "Id de la compañía (obligatorio)." },
            status: {
              type: "string",
              enum: ["prospect", "active", "on_hold", "done", "cancelled"],
            },
            startDate: { type: "string", description: "Fecha de inicio 'YYYY-MM-DD'." },
            endDate: { type: "string", description: "Fecha de fin 'YYYY-MM-DD'." },
            description: { type: "string" },
          },
          required: ["code", "name", "companyId"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, PROJECTS_MODULE, "create");
      const { input, errors } = projectInputFrom(args);
      throwIfErrors(errors);
      if (!companies.get(input.companyId))
        throw new Error("La compañía seleccionada no existe.");
      if (projects.getByCode(input.code))
        throw new Error("Ya existe un proyecto con ese código.");
      if (dryRun)
        return `Crear proyecto: código="${input.code}", nombre="${input.name}", compañía #${input.companyId}.`;
      const created = projects.create(input, user.id);
      return `Proyecto #${created.id} creado ("${created.code}").`;
    },
  },
  {
    module: PROJECTS_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_project",
        description:
          "Actualiza un proyecto existente. Solo cambia los campos que envíes.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            code: { type: "string" },
            name: { type: "string" },
            companyId: { type: "integer" },
            status: {
              type: "string",
              enum: ["prospect", "active", "on_hold", "done", "cancelled"],
            },
            startDate: { type: "string" },
            endDate: { type: "string" },
            description: { type: "string" },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, PROJECTS_MODULE, "update");
      const id = reqId(args.id);
      const existing = projects.get(id);
      if (!existing) throw new Error("Proyecto no encontrado.");
      const { input, errors } = projectInputFrom(args, existing);
      throwIfErrors(errors);
      if (!companies.get(input.companyId))
        throw new Error("La compañía seleccionada no existe.");
      const clash = projects.getByCode(input.code);
      if (clash && clash.id !== id)
        throw new Error("Ya existe un proyecto con ese código.");
      if (dryRun)
        return `Actualizar proyecto #${id}: código="${input.code}", nombre="${input.name}".`;
      return projects.update(id, input)
        ? `Proyecto #${id} actualizado.`
        : "No se pudo actualizar el proyecto.";
    },
  },
  // --- Tasks: read (row-level scoped) ---
  {
    module: TASKS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_tasks",
        description:
          "Lista las tareas que el usuario puede ver (creadas por él o asignadas a él). Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda por título o descripción." },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "done", "cancelled"],
            },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            scope: {
              type: "string",
              enum: ["created", "assigned"],
              description: "Limita a las creadas por mí o asignadas a mí.",
            },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, TASKS_MODULE, "view");
      return JSON.stringify(
        tasks.list({
          userId: user.id,
          role: user.role,
          q: optStr(args.q),
          status: optStr(args.status),
          priority: optStr(args.priority),
          scope: optStr(args.scope),
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: TASKS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_task",
        description: "Obtiene una tarea por su id (solo si el usuario puede verla).",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, TASKS_MODULE, "read");
      const id = reqId(args.id);
      if (!tasks.canView(user.id, user.role, id))
        return JSON.stringify({ error: "Tarea no encontrada o sin acceso." });
      const task = tasks.get(id);
      if (!task) return JSON.stringify({ error: "Tarea no encontrada." });
      return JSON.stringify({
        ...task,
        assigneeUsers: tasks.assigneeUsers(id),
        assigneeRoles: tasks.assigneeRoles(id),
      });
    },
  },
  // --- Tasks: write (row-level scoped) ---
  {
    module: TASKS_MODULE,
    action: "create",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "create_task",
        description:
          "Crea una tarea. Fechas opcionales de inicio/fin 'YYYY-MM-DDTHH:MM'. Puedes asignarla a usuarios (ids) y/o roles.",
        parameters: {
          type: "object",
          properties: {
            title: { type: "string" },
            description: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "done", "cancelled"],
            },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            startAt: { type: "string", description: "Inicio 'YYYY-MM-DDTHH:MM' (opcional)." },
            endAt: { type: "string", description: "Fin/límite 'YYYY-MM-DDTHH:MM' (opcional)." },
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
          required: ["title"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, TASKS_MODULE, "create");
      const { input, errors } = taskInputFrom(args);
      throwIfErrors(errors);
      if (dryRun)
        return `Crear tarea: título="${input.title}", prioridad="${input.priority}", estado="${input.status}".`;
      const created = tasks.create(input, user.id);
      return `Tarea #${created.id} creada ("${created.title}").`;
    },
  },
  {
    module: TASKS_MODULE,
    action: "update",
    mutating: true,
    spec: {
      type: "function",
      function: {
        name: "update_task",
        description:
          "Actualiza una tarea que el usuario pueda ver. Solo cambia los campos que envíes.",
        parameters: {
          type: "object",
          properties: {
            id: { type: "integer" },
            title: { type: "string" },
            description: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "done", "cancelled"],
            },
            priority: { type: "string", enum: ["low", "medium", "high"] },
            startAt: { type: "string" },
            endAt: { type: "string" },
            assigneeUserIds: { type: "array", items: { type: "integer" } },
            assigneeRoles: { type: "array", items: { type: "string" } },
          },
          required: ["id"],
        },
      },
    },
    run: (args, user, dryRun) => {
      assertCan(user, TASKS_MODULE, "update");
      const id = reqId(args.id);
      if (!tasks.canView(user.id, user.role, id))
        throw new Error("Tarea no encontrada o sin acceso.");
      const existing = tasks.get(id);
      if (!existing) throw new Error("Tarea no encontrada.");
      const { input, errors } = taskInputFrom(args, existing);
      throwIfErrors(errors);
      if (dryRun)
        return `Actualizar tarea #${id}: título="${input.title}", estado="${input.status}".`;
      return tasks.update(id, input)
        ? `Tarea #${id} actualizada.`
        : "No se pudo actualizar la tarea.";
    },
  },
  // --- Visits: read only (audio visits are logged via voice messages) ---
  {
    module: VISITS_MODULE,
    action: "view",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "list_visits",
        description:
          "Lista bitácoras (visitas) con búsqueda y filtros. Devuelve una página.",
        parameters: {
          type: "object",
          properties: {
            q: { type: "string", description: "Búsqueda en notas, resumen o transcripción." },
            companyId: { type: "integer" },
            projectId: { type: "integer" },
            status: {
              type: "string",
              enum: ["draft", "processing", "ready", "failed"],
            },
            source: { type: "string", enum: ["web", "telegram"] },
            page: { type: "integer" },
          },
          required: [],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, VISITS_MODULE, "view");
      return JSON.stringify(
        visits.list({
          q: optStr(args.q),
          companyId: optNum(args.companyId),
          projectId: optNum(args.projectId),
          status: optStr(args.status),
          source: optStr(args.source),
          page: optNum(args.page),
        })
      );
    },
  },
  {
    module: VISITS_MODULE,
    action: "read",
    mutating: false,
    spec: {
      type: "function",
      function: {
        name: "get_visit",
        description: "Obtiene una bitácora por su id, con sus accionables.",
        parameters: {
          type: "object",
          properties: { id: { type: "integer" } },
          required: ["id"],
        },
      },
    },
    run: (args, user) => {
      assertCan(user, VISITS_MODULE, "read");
      const id = reqId(args.id);
      const visit = visits.get(id);
      if (!visit) return JSON.stringify({ error: "Bitácora no encontrada." });
      return JSON.stringify({ ...visit, actionItems: visits.listActionItems(id) });
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
