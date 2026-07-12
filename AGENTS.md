# AGENTS.md

Guidance for AI agents and contributors working in **bun-sqlite-erp-poc**. Read this
before making changes so edits stay consistent with the existing architecture.

## What this project is

A small, server-rendered web app with **no client build step**.

- **Runtime:** [Bun](https://bun.sh) (v1.1+)
- **Language:** TypeScript, strict mode, `verbatimModuleSyntax`, explicit `.ts`
  import extensions
- **Storage:** SQLite via Bun's built-in `bun:sqlite`
- **UI:** HTML rendered from template strings on the server + [HTMX](https://htmx.org)
  for partial updates. No React/Vue, no bundler.

## Run & test

```bash
bun install
bun run dev     # watch mode, http://localhost:4000
bun run start   # one-off run
```

- `tsc` is not part of the workflow. **Type/import checking is done by booting
  with Bun** (`bun src/index.ts`) — Bun runs TS directly and fails on bad module
  resolution. There are no automated tests yet.
- Port is `PORT` (default `4000`). Prod behavior toggles on `NODE_ENV=production`.

## Folder structure

```text
bun-sqlite-erp-poc/
  data/                 # SQLite database lives here (git-ignored; .gitkeep tracked)
  src/
    index.ts            # Entry: build Router, registerModule(...) each module, dispatch
    db.ts               # Shared SQLite connection (data/app.sqlite) + PRAGMAs
    theme.ts            # SINGLE SOURCE OF TRUTH for design tokens + :root CSS vars
    views.ts            # Dashboard page for "/"
    globals.d.ts        # Ambient Bun / bun:sqlite type declarations
    components/         # Presentation-only, reusable building blocks
      layout.ts         # HTML document shell (injects theme), HTMX_SCRIPT, escapeHtml
      nav.ts            # Permission-aware top navigation
      table.ts          # Generic data table
      badge.ts          # Status pill
    core/               # Framework-style plumbing (no feature logic)
      http.ts           # html / redirect / notFound / forbidden helpers
      router.ts         # Tiny ":param" router + RouteContext
      modules.ts        # AppModule base class + registerModule / getModules
      permissions.ts    # can() / registerPermissions + Role & Action types
      repository.ts     # Repository base class holding the shared db
    modules/            # Feature modules, one folder per module (see "Module anatomy")
```

Modules are added and removed over time, so the set under `src/modules/` is not
fixed. A few conventions still apply:

- New modules should copy the shape of an existing reference module.
- `auth/`, when present, is a **special** module (see "The auth module" below).


## Module anatomy

Every feature is a folder under `src/modules/<name>/` with these files (a module
that owns no table of its own may omit `<name>.db.ts` — see **The users
module**):

| File               | Responsibility                                                        |
| ------------------ | --------------------------------------------------------------------- |
| `<name>.db.ts`     | `Repository` subclass, table `CREATE`, and row/input types — only when the module owns a table |
| `<name>.rules.ts`  | `ModulePermissions` matrix, the module key constant, form validation  |
| `<name>.views.ts`  | HTML/HTMX rendering functions                                         |
| `<name>.routes.ts` | `register<Name>Routes(router)` — one handler per route                |
| `index.ts`         | `class XModule extends AppModule` + exported singleton `xModule`; side-effect `import "./<name>.db.ts"` (table-owning modules) so the `CREATE` runs at load |

### Adding a module

1. Copy an existing reference module folder under `src/modules/` as a starting point.
2. Define the permission matrix and validation in `<name>.rules.ts`.
3. Extend `AppModule` in `index.ts` and export a singleton (`export const
   <name>Module = new <Name>Module()`). `register()` calls `registerPermissions`
   and `register<Name>Routes`. If the module owns a table, also add a side-effect
   `import "./<name>.db.ts"` so its `CREATE TABLE` runs when the module loads.
4. Import that singleton in `src/index.ts` and add
   `registerModule(router, <name>Module)`.

That automatically wires up routes, permission enforcement, a dashboard card,
and a nav entry.

## Project rules (do / don't)

- **Theming:** all colors, spacing, typography, and radii live in
  `src/theme.ts` and are exposed as CSS custom properties. Components
  and views must reference them via `var(--token)` — **never hardcode hex colors
  or other design values inside a component or view.**
- **Permissions:** gate every capability in **both** places — hide the control
  in the view **and** return `forbidden()` in the route. The matrix in
  `<name>.rules.ts` (keyed by role) is the single source of truth.
- **Data access:** only through `Repository` subclasses. Never open a second DB
  connection; all repositories share the singleton from `src/db.ts`. Scope
  per-user data by `user.id`.
- **The `User` type** lives in `src/modules/auth/auth.db.ts`. Import it
  **type-only** (`import type { User }`). Do **not** import `User` from
  `src/db.ts`.
- **Escaping:** always run user-supplied text through `escapeHtml()` before
  interpolating it into server-rendered HTML (XSS defense).
- **Database files:** stored under `data/` and git-ignored. Keep `data/.gitkeep`
  so the folder exists on fresh clones.
- **Imports:** always include the `.ts` extension and keep `import type` for
  type-only imports (required by `verbatimModuleSyntax`).

## The auth module (special case)

Auth extends `AppModule` like any other module but deliberately diverges from
the standard shape. Each divergence is commented in-code:

- `auth.db.ts` owns **three** tables/repositories (users, sessions,
  password-reset tokens) instead of one.
- `auth.service.ts` adds a **service layer** (hashing, sessions, tokens) so
  routes never touch SQL or crypto directly — regular modules don't need this.
- `auth.rules.ts` has **no permission matrix**: account actions aren't role-gated,
  so auth never calls `registerPermissions` and never appears in the nav.
- `auth.routes.ts` exposes `handlePublicAuth` for the **public**
  login/register/logout/reset routes. These must run **before** the auth guard,
  so `src/index.ts` dispatches them directly instead of through the router.
  `register()` only mounts the authenticated `/account` routes.

## The users module (special case)

The `users` module handles admin-facing account management and is deliberately
**thin**: it owns **no table of its own**. Instead of a `users.db.ts`, it reuses
the `UserRepository` from `src/modules/auth/auth.db.ts` (users and auth share the
same `users` table). Consequences of owning no table:

- There is no `users.db.ts`, and `users/index.ts` has **no** side-effect
  `import "./users.db.ts"`.
- Data access still goes through a `Repository` subclass (`UserRepository`), just
  one that the auth module defines.

It is otherwise a normal module: `users.rules.ts` declares an admin-only
permission matrix, and it appears in the nav and dashboard for admins.

## Pitfalls

- **Repository TDZ:** in `repository.ts` the constructor default must not shadow
  the imported binding. Use `import { db as sharedDb }` then
  `constructor(protected readonly db: Database = sharedDb)`. Naming both `db`
  causes a runtime `Cannot access 'db' before initialization`.
- **Stale editor errors:** after moving/renaming `.ts` files, the VS Code TS
  server may show phantom "cannot find module" errors even though Bun runs fine.
  Run the `TypeScript: Restart TS Server` command to clear them.
