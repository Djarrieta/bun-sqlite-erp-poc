import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./inventory.db.ts"; // side effect: ensure the inventory table exists
import { INVENTORY_MODULE, INVENTORY_PERMISSIONS } from "./inventory.rules.ts";
import { registerInventoryRoutes } from "./inventory.routes.ts";

/**
 * The inventory module: a read-only ledger of current stock per item/location.
 * Writes are owned by the movements module (via confirmed movements).
 */
export class InventoryModule extends AppModule {
  readonly name = INVENTORY_MODULE;
  readonly label = "Inventario";
  readonly basePath = "/inventory";

  register(router: Router): void {
    registerPermissions(INVENTORY_MODULE, INVENTORY_PERMISSIONS);
    registerInventoryRoutes(router);
  }
}

export const inventoryModule = new InventoryModule();
