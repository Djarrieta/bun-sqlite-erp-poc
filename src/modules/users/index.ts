import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import { USERS_MODULE, USER_PERMISSIONS } from "./users.rules.ts";
import { registerUserRoutes } from "./users.routes.ts";

/**
 * The users module: admin-facing management of accounts. Self-service password
 * changes are handled separately under /account.
 */
export class UsersModule extends AppModule {
  readonly name = USERS_MODULE;
  readonly label = "Usuarios";
  readonly basePath = "/users";

  register(router: Router): void {
    registerPermissions(USERS_MODULE, USER_PERMISSIONS);
    registerUserRoutes(router);
  }
}

export const usersModule = new UsersModule();
