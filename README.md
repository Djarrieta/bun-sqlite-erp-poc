# bun-sqlite-erp-poc

A minimal, modular web app built with **Bun**, **TypeScript**, **HTMX**, and
**SQLite**.

- Server-rendered HTML with zero client-side build step
- HTMX for interactivity (create / edit / delete without full page reloads)
- SQLite storage via Bun's built-in `bun:sqlite` driver
- Feature-module architecture with per-role permissions and cookie sessions

## Requirements

- [Bun](https://bun.sh) (v1.1+)

## Setup

```bash
bun install
```

## Run

```bash
bun run dev      # watch mode with auto-reload
# or
bun run start
```

Then open <http://localhost:4000>

The SQLite database is created automatically on first run at `data/app.sqlite`
(the `data/` folder is git-ignored). The first account you register becomes the
`admin`; everyone after defaults to `member`.

## Project structure

```text
src/
  index.ts       # HTTP server: registers modules and dispatches requests
  db.ts          # Shared SQLite connection
  theme.ts       # Design tokens + :root CSS variables (single source of truth)
  components/    # Reusable UI (layout, nav, table, badge)
  core/          # Router, permissions, repository base, module system, CSV
  modules/       # Feature modules: items, locations, inventory, movements, users, auth
```

See [AGENTS.md](AGENTS.md) for architecture, conventions, and how to add a
module.
