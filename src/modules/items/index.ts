import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./items.db.ts"; // side effect: ensure the items table exists
import { ITEMS_MODULE, ITEM_PERMISSIONS } from "./items.rules.ts";
import { registerItemRoutes } from "./items.routes.ts";

/**
 * The items module. Adding it to the server (via `registerModule`) wires up its
 * permissions, routes, and navigation entry. New modules follow this shape.
 */
export class ItemsModule extends AppModule {
  readonly name = ITEMS_MODULE;
  readonly label = "Items";
  readonly basePath = "/items";

  register(router: Router): void {
    registerPermissions(ITEMS_MODULE, ITEM_PERMISSIONS);
    registerItemRoutes(router);
  }
}

export const itemsModule = new ItemsModule();
