import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./movements.db.ts"; // side effect: ensure the movements tables exist
import { MOVEMENTS_MODULE, MOVEMENT_PERMISSIONS } from "./movements.rules.ts";
import { registerMovementRoutes } from "./movements.routes.ts";

/**
 * The movements module: create, list and confirm stock movements (intake,
 * transfer, dispatch). Confirmation applies the effect to inventory
 * transactionally; confirmed movements are immutable.
 */
export class MovementsModule extends AppModule {
  readonly name = MOVEMENTS_MODULE;
  readonly label = "Movimientos";
  readonly basePath = "/movements";

  register(router: Router): void {
    registerPermissions(MOVEMENTS_MODULE, MOVEMENT_PERMISSIONS);
    registerMovementRoutes(router);
  }
}

export const movementsModule = new MovementsModule();
