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
    index.ts            # Entry: build Router, registerModule(...) each module, dispatch
    db.ts               # Shared SQLite connection (data/app.sqlite) + PRAGMAs
    theme.ts            # SINGLE SOURCE OF TRUTH for design tokens + :root CSS vars
    views.ts            # Dashboard page for "/"
    globals.d.ts        # Ambient Bun / bun:sqlite type declarations
    components/         # Presentation-only, reusable building blocks
      layout.ts         # HTML document shell + centralized component CSS, HTMX_SCRIPT, escapeHtml
      page.ts           # page() shell (nav + layout), pageHeader(), backLink()
      nav.ts            # Permission-aware top navigation
      button.ts         # button() / linkButton() with variants + sizes
      form.ts           # textField() / selectField() / formActions()
      card.ts           # card() surface (renders <div> or <form>)
      feedback.ts       # alert() banners (error / success / info / warning)
      table.ts            # Data table; dataTable() adds search + pagination + mobile cards
      badge.ts          # Status pill
    core/               # Framework-style plumbing (no feature logic)
      http.ts           # html / redirect / notFound / forbidden helpers
      router.ts         # Tiny ":param" router + RouteContext
      modules.ts        # AppModule base class + registerModule / getModules
      permissions.ts    # can() / registerPermissions + Role & Action types
      repository.ts       # Repository base: shared db + paginate() (search + pagination)
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
| `<name>.seed.ts`   | Optional dev seed: exports `seed<Name>()` used by `bun seeddb` (auth needs none) |
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
- **UI composition:** build screens from the shared components in
  `src/components/` — render authenticated pages with `page()` (nav + shell),
  and use `pageHeader()`, `card()`, `textField()`/`selectField()`,
  `button()`/`linkButton()`, `table()`/`dataTable()`, `badge()` and `alert()`
  instead of hand-writing markup. Their styles are centralized in `layout.ts`,
  so a new module should need little or no CSS of its own (only truly
  module-specific bits belong in a small `PAGE_STYLES`). See **Building list
  screens** for tables that need search and pagination.
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
pagination CSS lives in `layout.ts` so HTMX fragments (which ship no styles)
stay styled.

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
