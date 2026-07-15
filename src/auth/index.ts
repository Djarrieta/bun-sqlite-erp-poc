/**
 * Auth subsystem entry point.
 *
 * Auth is NOT a feature module: it never joined the `AppModule` / permission /
 * navigation machinery, so it lives at `src/auth` alongside other core plumbing
 * (like `src/bot`) instead of under `src/modules`. It is wired directly in
 * `src/index.ts`:
 *
 *   - `handlePublicAuth` serves the PUBLIC login/logout routes and must run
 *     BEFORE the auth guard, so it is dispatched directly (not via the router).
 *   - `registerAccountRoutes` mounts the authenticated self-service `/account`
 *     routes on the shared router.
 *   - `authService` owns hashing, sessions, and account rules.
 */
import "./auth.db.ts"; // side effect: ensure the users/sessions tables exist

export { authService } from "./auth.service.ts";
export { handlePublicAuth, registerAccountRoutes } from "./auth.routes.ts";
export { UserRepository, SessionRepository, type User } from "./auth.db.ts";
