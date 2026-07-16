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
bun seeddb      # populate the DB from each module's *.seed.ts
bun resetdb     # wipe ALL data (users included), leaving an empty schema
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
    index.ts            # Entry: build Router, registerModule(...) modules, wire auth, dispatch
    db.ts               # Shared SQLite connection (data/app.sqlite) + PRAGMAs
    theme.ts            # SINGLE SOURCE OF TRUTH for design tokens + :root CSS vars
    views.ts            # Dashboard page for "/"
    globals.d.ts        # Ambient Bun / bun:sqlite type declarations
    components/         # Presentation-only, reusable building blocks
      layout.ts         # HTML document shell; @font-face + aggregates each component's styles, HTMX_SCRIPT, escapeHtml
      *.ts              # Reusable UI building blocks (page shell, nav, buttons, forms, cards, tables, badges, etc.); each owns its styles
    core/               # Framework-style plumbing (no feature logic)
      http.ts           # html / redirect / notFound / forbidden helpers
      router.ts         # Tiny ":param" router + RouteContext
      modules.ts        # AppModule base class + registerModule / getModules
      permissions.ts    # can() / registerPermissions + Role & Action types
      repository.ts       # Repository base: shared db + paginate() (search + pagination)
      dates.ts          # Date math (month/week grids, Monday-first) + display formatters
    auth/               # Auth SUBSYSTEM (not a feature module): login, sessions, /account
      index.ts          # Barrel: authService, handlePublicAuth, registerAccountRoutes
      auth.db.ts        # users + sessions tables/repositories; exports the shared User type
      auth.service.ts   # authService: hashing, session lifecycle, account rules
      auth.routes.ts    # handlePublicAuth (pre-guard login/logout) + registerAccountRoutes
      auth.rules.ts     # Password/email validation constants (no permission matrix)
      auth.views.ts     # Login screen + /account page
    modules/            # Feature modules, one folder per module (see "Module anatomy")
    bot/                # Telegram bot (separate process: `bun run bot`); reuses auth + modules
```

Modules are added and removed over time, so the set under `src/modules/` is not
fixed. A few conventions still apply:

- New modules should copy the shape of an existing reference module.
- Auth is **not** a module — it lives at `src/auth` (see "The auth subsystem").


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
| `<name>.seed.ts`   | Optional dev seed: exports `seed<Name>()` used by `bun seeddb` (omit if none) |
| `index.ts`         | `class XModule extends AppModule` + exported singleton `xModule`; side-effect `import "./<name>.db.ts"` (table-owning modules) so the `CREATE` runs at load |

### Adding a module

> **Full checklist — every file to create/edit, including the Telegram bot —
> lives in the `create-module` skill:**
> [`.agents/skills/create-module/SKILL.md`](.agents/skills/create-module/SKILL.md).
> Read it before adding a module. It walks through every file to create and wire
> up so the module gets its routes, permission enforcement, dashboard card, nav
> entry, and the assistant's tools.

## Project rules (do / don't)

- **Git / version control:** never run state-changing git commands (`git add`,
  `git commit`, `git mv`, `git rm`, `git push`, `git reset`, branch/checkout,
  etc.) unless the user **explicitly** asks. Move or delete files with plain
  filesystem operations, not git. Read-only git (e.g. `git status`, `git diff`)
  is fine.
- **Theming:** all colors, spacing, typography, and radii live in
  `src/theme.ts` and are exposed as CSS custom properties. Components
  and views must reference them via `var(--token)` — **never hardcode hex colors
  or other design values inside a component or view.** Fonts are self-hosted in
  `public/fonts/` (variable woff2, served by `index.ts`) and declared with
  `@font-face` in `layout.ts`; run `bun fonts` to refresh them.
- **UI composition:** build screens from the shared components in
  `src/components/` — render authenticated pages with `page()` (nav + shell),
  and use `pageHeader()`, `card()`, `textField()`/`selectField()`/`textareaField()`,
  `chipGroup()`, `button()`/`linkButton()`, `table()`/`dataTable()`, `badge()`
  and `alert()` instead of hand-writing markup. For a set of related statuses
  (status/kind/role) build one `statusMap()` for its label + badge + options;
  for month/week calendars use `calendarRegion()`. Each component owns its CSS
  (exported as a `<name>Styles` const beside its markup) and `layout.ts`
  aggregates them into one global stylesheet, so a new module should need little
  or no CSS of its own (only truly module-specific bits belong in a small
  `PAGE_STYLES`). See **Building
  list screens** for tables that need search and pagination.
- **Permissions:** gate every capability in **both** places — hide the control
  in the view **and** return `forbidden()` in the route. The matrix in
  `<name>.rules.ts` (keyed by role) is the single source of truth.
- **Data access:** only through `Repository` subclasses. Never open a second DB
  connection; all repositories share the singleton from `src/db.ts`. Scope
  per-user data by `user.id`. **Exception — shared/org-wide modules:** the
  catalog/inventory modules (`items`, `locations`, `inventory`, `movements`) are
  deliberately **not** per-user scoped; everyone sees the same data and
  `created_by` is audit-only. New feature modules should still default to
  per-user scoping unless they are shared master data like these.
- **The `User` type** lives in `src/auth/auth.db.ts`. Import it
  **type-only** (`import type { User }`). Do **not** import `User` from
  `src/db.ts`.
- **Escaping:** always run user-supplied text through `escapeHtml()` before
  interpolating it into server-rendered HTML (XSS defense).
- **Database files:** stored under `data/` and git-ignored. Keep `data/.gitkeep`
  so the folder exists on fresh clones.
- **Schema changes / migrations:** there are **none**. The dev database holds no
  important data, so evolve a schema by editing its `CREATE TABLE IF NOT EXISTS`
  and deleting `data/app.sqlite` (it is recreated on the next boot). Do **not**
  add `ALTER TABLE` / `PRAGMA table_info` migration code.
- **Imports:** always include the `.ts` extension and keep `import type` for
  type-only imports (required by `verbatimModuleSyntax`).

## Building list screens (mobile-first tables)

This app is used mostly on **mobile**, and lists can hold **thousands** of
rows. Build every list with `dataTable()` from `src/components/table.ts` — never
hand-roll `<table>` markup, and prefer it over the low-level `table()` for any
list that can grow. `dataTable()` gives you three things that must all keep
working when you touch a list:

- **Responsive rows.** Wide screens get a normal table; below 640px each row
  collapses into a stacked card of `label: value` pairs (driven by each cell's
  `data-label`). Mark the headline column with `primary: true` so its value
  becomes the card title. **This mobile card view is the primary, optimized
  experience — verify it whenever you change a list.**
- **Search.** Pass `search: { value, placeholder }`. The box filters (debounced,
  via HTMX) by whatever columns the repository searches, and pushes the query to
  the URL so it's bookmarkable.
- **Filters.** Pass `filters: [{ name, label, options, value }]` for a dropdown,
  or `{ name, label, options, multiple: true, values }` for a multi-select chip
  group, behind a funnel icon next to the search box. Search + filters share one
  `<form>` so they submit together; multi-selects repeat the key (`tag=a&tag=b`),
  read with `url.searchParams.getAll(name)`. Filter param names become
  form-field/URL names, so keep them **trusted constants**, and bind every filter
  *value* into the `where` clause (never interpolate it).
- **Pagination.** Pass `pagination: { page, pageSize, total }`. Always page in
  SQL via the repository — never load a whole table into memory.

Wire a new list module in three steps (copy the `items` module's shape):

1. **Repository** — expose `list(userId, params: PageParams): Page<Row>` that
   delegates to the base `Repository.paginate(...)`, naming the searchable
   columns. Only `q` and `params` are safely bound; **every other `paginate`
   field is interpolated into SQL, so pass only trusted constants there — never
   user input.**
2. **Route** — read `q` and `page` from `url.searchParams`, gate with `can(...)`,
   then: if the request has the `HX-Request` header return the results fragment
   (`dataTableBody(...)`, exposed as an `xResults(...)` view); otherwise return
   the full page. Push-URL keeps a refresh/bookmark working via this same path.
3. **View** — build **one** `DataTableOptions` object (same `id` and `endpoint`)
   and feed it to both `dataTable(...)` (full page) and `dataTableBody(...)`
   (fragment) so the two render identically.

Do **not** re-add per-component `<style>` for tables: all data-table, search and
pagination CSS lives beside the component in `table.ts` (its exported
`tableStyles`, aggregated globally by `layout.ts`) so HTMX fragments (which ship
no styles) stay styled.

## The auth subsystem (not a module)

Auth is core plumbing, **not** a feature module. It never used the module
machinery (no permission matrix, no nav entry, no dashboard card), so it lives at
`src/auth` — alongside `src/bot` — instead of under `src/modules`, and is wired
directly in `src/index.ts` rather than via `registerModule`. Its shape:

- `auth/index.ts` is a **barrel** (not an `AppModule`): it re-exports
  `authService`, `handlePublicAuth`, and `registerAccountRoutes`, plus the
  `User` type and `UserRepository`, and runs the `auth.db.ts` side effect.
- `auth.db.ts` owns **two** tables/repositories (users, sessions) and exports the
  shared `User` type.
- `auth.service.ts` adds a **service layer** (hashing, sessions) so routes never
  touch SQL or crypto directly.
- `auth.rules.ts` holds only password/email validation constants — **no
  permission matrix**: account actions aren't role-gated, so auth never calls
  `registerPermissions` and never appears in the nav.
- `auth.routes.ts` exposes `handlePublicAuth` for the **public** login/logout
  routes (dispatched **before** the auth guard in `src/index.ts`) and
  `registerAccountRoutes` for the authenticated `/account` routes (mounted on the
  shared router).

## The users module (special case)

The `users` module handles admin-facing account management and is deliberately
**thin**: it owns **no table of its own**. Instead of a `users.db.ts`, it reuses
the `UserRepository` from `src/auth/auth.db.ts` (users and auth share the
same `users` table). Consequences of owning no table:

- There is no `users.db.ts`, and `users/index.ts` has **no** side-effect
  `import "./users.db.ts"`.
- Data access still goes through a `Repository` subclass (`UserRepository`), just
  one that the auth subsystem defines.

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
