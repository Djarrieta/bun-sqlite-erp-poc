---
name: create-module
description: Step-by-step guide to add a new feature module to this Bun + SQLite + HTMX ERP. Lists every file to CREATE under src/modules/<name>/ and every file to EDIT to wire the module into the web app, the seed/reset scripts, AND the Telegram bot (module registration, agent tools, system prompt). Use whenever creating, scaffolding, or adding a module, feature, resource, or CRUD screen.
---

# Create a new module

A feature is a folder under `src/modules/<name>/` plus a few wiring edits. This
skill lists **every file to create and edit**, including the **Telegram bot**,
which is easy to miss: registering a module in the bot is _not_ enough — the
agent only exposes the tools listed in `src/bot/tools.ts` and the modules listed
in `src/bot/prompt.ts`.

Read `AGENTS.md` first — this skill is the procedural companion to its
**"Module anatomy"** and **"Building list screens"** sections. Copy the shape of
an existing reference module instead of writing from scratch:

- **Simple CRUD, shared org-wide:** `src/modules/locations/` (code/name/status).
- **Owns a FK to another module + a related section:** `src/modules/projects/`.
- **Row-scoped visibility (creator/assignee):** `src/modules/tasks/`
  (permissive matrix + `canView`).
- **Cross-module reads/writes:** `src/modules/movements/` (uses items,
  locations, inventory repos).

Throughout, replace `<name>` (lowercase key, e.g. `projects`) and `<Name>`
(PascalCase, e.g. `Project`).

## Complete file checklist

| Action | Path | Purpose |
| ------ | ---- | ------- |
| CREATE | `src/modules/<name>/<name>.db.ts` | `Repository` subclass, `CREATE TABLE`, row/input/list-params types. **Omit only if the module owns no table** (like `users`). |
| CREATE | `src/modules/<name>/<name>.rules.ts` | `<NAME>_MODULE` key constant, `ModulePermissions` matrix, `parse<Name>Form`, status arrays. |
| CREATE | `src/modules/<name>/<name>.views.ts` | HTML/HTMX renderers built from `src/components/`. |
| CREATE | `src/modules/<name>/<name>.routes.ts` | `register<Name>Routes(router)` — one handler per route, each gated by `can(...)`. |
| CREATE | `src/modules/<name>/<name>.seed.ts` | Optional dev seed exporting `seed<Name>()`. |
| CREATE | `src/modules/<name>/index.ts` | `class <Name>Module extends AppModule` + exported singleton; side-effect `import "./<name>.db.ts"`. |
| EDIT | `src/index.ts` | Import the singleton + `registerModule(router, <name>Module)`. |
| EDIT | `src/scripts/seed.ts` | Side-effect `import "../modules/<name>/<name>.db.ts"` + `import { seed<Name> }` + call it. |
| EDIT | `src/scripts/reset.ts` | Side-effect `import "../modules/<name>/<name>.db.ts"` so a fresh reset creates+clears the table. |
| EDIT | `src/bot/index.ts` | Import the singleton + `registerModule(...)` so the bot has the tables + permission registry. |
| EDIT | `src/bot/tools.ts` | Repo import + instance + `<name>InputFrom` adapter + tool objects in `BOT_TOOLS`. |
| EDIT | `src/bot/prompt.ts` | Add `{ key: "<name>", label: "<Label>" }` to the `MODULES` array. |

## Step 1 — Create the module folder

Create the six files under `src/modules/<name>/`.

### `<name>.db.ts` — data access

Export the row type, the input type, the list-params type, run the `CREATE
TABLE IF NOT EXISTS` as a side effect, and a `Repository` subclass whose `list`
delegates to the base `paginate(...)`.

```ts
import { Repository, type Page, type PageParams } from "../../core/repository.ts";
import { db } from "../../db.ts";

export interface X { id: number; code: string; name: string; is_active: number; created_at: string; updated_at: string; }
export interface XInput { code: string; name: string; isActive: boolean; }
export interface XListParams extends PageParams { active?: string; }

db.exec(`
  CREATE TABLE IF NOT EXISTS xs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
`);

export class XRepository extends Repository {
  list(params: XListParams = {}): Page<X> {
    const where: string[] = []; const bind: (string | number)[] = [];
    if (params.active === "1" || params.active === "0") { where.push("is_active = ?"); bind.push(Number(params.active)); }
    return this.paginate<X>({ from: "xs", where, params: bind, searchColumns: ["code", "name"], q: params.q, orderBy: "id DESC", page: params.page, pageSize: params.pageSize });
  }
  get(id: number): X | null { return this.db.query<X, [number]>("SELECT * FROM xs WHERE id = ?").get(id); }
  create(input: XInput /*, createdBy: number */): X { /* INSERT ... RETURNING * */ }
  update(id: number, input: XInput): X | null { /* UPDATE ... RETURNING * */ }
}
```

- **Foreign keys** to another module (`... REFERENCES companies(id)`) are fine
  even as a **forward reference** to a table created later — SQLite only enforces
  FKs on INSERT/UPDATE, not at CREATE. Add an index for each FK column.
- **`paginate` security:** only `q` and `params` are bound; `from`, `where`,
  `searchColumns`, `orderBy` are interpolated — pass **trusted constants** only.
- **Scoping:** default to per-user (`WHERE user_id = ?`). Shared master data
  (catalog/CRM) is org-wide with `created_by` audit-only — mirror a similar
  module.

### `<name>.rules.ts` — key, permissions, validation

```ts
import type { ModulePermissions } from "../../core/permissions.ts";
import type { XInput } from "./x.db.ts";

export const X_MODULE = "xs";
export const X_PERMISSIONS: ModulePermissions = {
  admin: ["view", "create", "read", "update", "delete"],
  sales: ["view", "read"], financial: ["view", "read"],
  engineer: ["view", "read"], logistic: ["view", "read"], member: ["view", "read"],
};

export interface ParsedXForm { input: XInput; errors: Record<string, string>; }
export function parseXForm(form: FormData): ParsedXForm {
  const code = String(form.get("code") ?? "").trim().toUpperCase();
  const name = String(form.get("name") ?? "").trim();
  const errors: Record<string, string> = {};
  if (!code) errors.code = "El código es obligatorio.";
  if (!name) errors.name = "El nombre es obligatorio.";
  return { input: { code, name, isActive: String(form.get("is_active") ?? "1") === "1" }, errors };
}
```

- **Row-scoped modules** (visible only to creator/assignee): build the matrix
  permissively over `USER_ROLES` and enforce access with a repository `canView`
  in the routes — copy `events`/`tasks`. Validators that reference other rows
  (assignees, FKs) take the valid-id set / are cross-checked in the route.

### `<name>.views.ts` — rendering

Build **only** from `src/components/` (`page`, `pageHeader`, `backLink`, `card`,
`textField`/`selectField`/`textareaField`, `formActions`, `button`/`linkButton`,
`badge`, `statusMap`, `dataTable`/`dataTableBody`, `alert`, `savedIndicator`,
`readOnlyNote`). Export: a full **list page**, a **results fragment**
(`dataTableBody`) sharing one `DataTableOptions`, a **new page**, an editable
**form fragment** (HTMX `hx-put` swap target), and a **detail page**. Gate every
control with `can(...)`. Escape user text with `escapeHtml()`. Never hardcode
colors/spacing — use `var(--token)`. See AGENTS.md **"Building list screens"**.

### `<name>.routes.ts` — handlers

```ts
export function registerXRoutes(router: Router): void {
  const xs = new XRepository();
  router.get("/xs", ({ req, url, user }) => { /* can view; HX-Request → results fragment else full page */ });
  router.get("/xs/new", ({ user }) => { /* can create; registered BEFORE "/xs/:id" */ });
  router.post("/xs", async ({ req, user }) => { /* can create; parse; on error re-render 400; else redirect */ });
  router.get("/xs/:id", ({ user, params }) => { /* can read */ });
  router.put("/xs/:id", async ({ req, user, params }) => { /* can update; return form fragment */ });
}
```

- Register literal paths (`/xs/new`) **before** `:id` params.
- Gate **every** handler with `can(user, X_MODULE, action)` → `forbidden()`.
  Permission is enforced in **both** the view and the route.
- HTMX list requests send `HX-Request: true` → return the results fragment;
  otherwise the full page.

### `<name>.seed.ts` — optional dev seed

Export `seed<Name>()`. Make it **idempotent** (skip when rows exist). Look up the
owner via `UserRepository` when you need a `created_by`; look up FK parents by
their unique code. Copy `locations.seed.ts` / `projects.seed.ts`.

### `index.ts` — the module

```ts
import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./x.db.ts"; // side effect: ensure the table exists at load
import { X_MODULE, X_PERMISSIONS } from "./x.rules.ts";
import { registerXRoutes } from "./x.routes.ts";

export class XModule extends AppModule {
  readonly name = X_MODULE;
  readonly label = "Equis";      // shown in nav + dashboard
  readonly basePath = "/xs";
  register(router: Router): void { registerPermissions(X_MODULE, X_PERMISSIONS); registerXRoutes(router); }
}
export const xModule = new XModule();
```

The nav entry and dashboard card appear automatically (both use `getModules()`
filtered by `can(view)`), so no edits to `nav.ts` or `views.ts` are needed.

## Step 2 — Wire into the web app

In `src/index.ts`: import the singleton and add `registerModule(router,
xModule)`. **Order matters for FK parents at seed time** — register a parent
module (e.g. `companies`) before its children (e.g. `contacts`, `projects`).

## Step 3 — Seed and reset scripts

- `src/scripts/seed.ts`: add the side-effect `import "../modules/<name>/<name>.db.ts"`,
  `import { seed<Name> } from "../modules/<name>/<name>.seed.ts"`, and call
  `seed<Name>()` in dependency order (parents before children).
- `src/scripts/reset.ts`: add the side-effect `import "../modules/<name>/<name>.db.ts"`
  so a reset on a fresh DB still creates and clears the table.

## Step 4 — Telegram bot (do not skip)

The bot is a separate process that reuses the same modules. Three edits:

### 4a. `src/bot/index.ts` — register the module

Import the singleton and add `registerModule(router, xModule)` alongside the
others. This populates the permission registry and runs the table side effect so
the bot shares the schema. **This alone does not expose anything to the agent.**

### 4b. `src/bot/tools.ts` — add agent tools

The agent can only call tools present in the `BOT_TOOLS` array. Add four pieces:

```ts
// (1) imports, next to the other module imports
import { XRepository, type X } from "../modules/x/x.db.ts";
import { parseXForm, X_MODULE } from "../modules/x/x.rules.ts";

// (2) a repository instance, next to the others (`const items = ...`)
const xs = new XRepository();

// (3) a FormData adapter, next to the other `*InputFrom` helpers.
//     Reuse the module's real validator; fall back to `base` for updates.
function xInputFrom(args: ToolArgs, base?: X) {
  const fd = new FormData();
  fd.set("code", args.code != null ? String(args.code) : base?.code ?? "");
  fd.set("name", args.name != null ? String(args.name) : base?.name ?? "");
  const isActive = args.isActive != null ? bool(args.isActive) : base ? base.is_active === 1 : true;
  fd.set("is_active", isActive ? "1" : "0");
  return parseXForm(fd);
}

// (4) tool objects inside the BOT_TOOLS array — read + write.
//     Each: { module, action, mutating, spec, run }. Mutating tools MUST
//     support dryRun (return a preview string without writing) and are
//     double-gated by assertCan(). Helpers available: assertCan, throwIfErrors,
//     optStr, optNum, reqId, strArray, bool.
{
  module: X_MODULE, action: "view", mutating: false,
  spec: { type: "function", function: { name: "list_xs", description: "Lista …. Devuelve una página.",
    parameters: { type: "object", properties: { q: { type: "string" }, page: { type: "integer" } }, required: [] } } },
  run: (args, user) => { assertCan(user, X_MODULE, "view"); return JSON.stringify(xs.list({ q: optStr(args.q), page: optNum(args.page) })); },
},
{
  module: X_MODULE, action: "read", mutating: false,
  spec: { type: "function", function: { name: "get_x", description: "Obtiene … por id.",
    parameters: { type: "object", properties: { id: { type: "integer" } }, required: ["id"] } } },
  run: (args, user) => { assertCan(user, X_MODULE, "read"); return JSON.stringify(xs.get(reqId(args.id)) ?? { error: "No encontrado." }); },
},
{
  module: X_MODULE, action: "create", mutating: true,
  spec: { type: "function", function: { name: "create_x", description: "Crea …",
    parameters: { type: "object", properties: { code: { type: "string" }, name: { type: "string" } }, required: ["code", "name"] } } },
  run: (args, user, dryRun) => {
    assertCan(user, X_MODULE, "create");
    const { input, errors } = xInputFrom(args); throwIfErrors(errors);
    if (dryRun) return `Crear …: código="${input.code}".`;
    const created = xs.create(input /*, user.id */); return `Creado #${created.id}.`;
  },
},
// update_x (mutating), delete_x/archive (mutating) — same shape.
```

- **Read-only modules** (e.g. inventory, or a module only queried by the bot):
  add just `list_*` / `get_*`.
- **Row-scoped modules:** `list_*` passes `userId: user.id`; `get_*`/`update_*`
  check the repository's `canView` before returning/writing (copy the `events`
  or `tasks` tools).
- `toolSpecsFor(user)` / `availableToolNames(user)` already filter by role, so a
  user only ever sees the tools their permissions allow — no extra work.

### 4c. `src/bot/prompt.ts` — advertise the module

Add an entry to the `MODULES` array so the system prompt lists the module and
the user's permitted actions:

```ts
{ key: "xs", label: "Equis" },
```

## Conventions (from AGENTS.md — do not violate)

- **Permissions** gated in both the view and the route; the matrix in
  `<name>.rules.ts` is the single source of truth.
- **Theming:** only `var(--token)` (from `src/theme.ts`); never hardcode
  colors/spacing/radii. Build UI from `src/components/` — no per-module `<style>`.
- **Lists:** always `dataTable()` (search + filters + pagination + mobile cards);
  page in SQL via `paginate`, never load whole tables.
- **Data access** only through `Repository` subclasses on the shared `db`
  singleton. Escape user text with `escapeHtml()`.
- **`User` type** is imported type-only from `src/auth/auth.db.ts`.
- **Imports** keep the `.ts` extension; `import type` for type-only imports.
- **Schema changes / migrations: none.** Evolve a schema by editing
  `CREATE TABLE IF NOT EXISTS` and deleting `data/app.sqlite`; do not add
  `ALTER TABLE`.

## Verify

1. **Type/import check** (no `tsc`): boot both entry points with Bun —
   `bun build src/index.ts src/bot/index.ts --target bun --outdir .verify-tmp`,
   then delete `.verify-tmp`.
2. **Fresh schema:** delete `data/app.sqlite*`, run `bun seeddb`, then `bun run dev`.
3. **Web:** log in and exercise the module's list, create, detail, update; confirm
   the nav entry + dashboard card appear only for permitted roles.
4. **Bot:** confirm the new tools load and the prompt lists the module, e.g.
   `bun -e "import { BOT_TOOLS } from './src/bot/tools.ts'; console.log(BOT_TOOLS.map(t=>t.spec.function.name).join(', '))"`.
   Then restart `bun run bot` and try "lista …" / "crea …" respecting roles.
