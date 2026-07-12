import { AppModule } from "../../core/modules.ts";
import type { Router } from "../../core/router.ts";
import "./auth.db.ts"; // side effect: ensure the users/sessions/reset tables exist
import { AUTH_MODULE } from "./auth.rules.ts";
import { registerAccountRoutes } from "./auth.routes.ts";

/**
 * The auth module. It follows the standard module shape (extends `AppModule`,
 * exports a singleton, registered via `registerModule`) but is a SPECIAL case:
 *
 *   - It owns multiple tables and a service layer (see `auth.db.ts` /
 *     `auth.service.ts`), where a typical module has a single repository.
 *   - `register()` only mounts the authenticated self-service `/account` routes.
 *     The PUBLIC login/register/logout/reset routes cannot go through the shared
 *     router (they must run before the auth guard), so they are exported as
 *     `handlePublicAuth` and dispatched directly in `src/index.ts`.
 *   - It does NOT call `registerPermissions`: account access isn't gated by the
 *     per-role matrix, so it also never appears as a nav entry.
 */
export class AuthModule extends AppModule {
  readonly name = AUTH_MODULE;
  readonly label = "Cuenta";
  readonly basePath = "/account";

  register(router: Router): void {
    registerAccountRoutes(router);
  }
}

export const authModule = new AuthModule();

// Re-exported so `src/index.ts` has a single import point for the module while
// still being able to dispatch the pre-guard public routes.
export { handlePublicAuth } from "./auth.routes.ts";
