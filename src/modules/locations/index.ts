import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./locations.db.ts"; // side effect: ensure the locations table exists
import { LOCATIONS_MODULE, LOCATION_PERMISSIONS } from "./locations.rules.ts";
import { registerLocationRoutes } from "./locations.routes.ts";

/**
 * The locations module: manage the shared directory of warehouses, stores and
 * transit points that movements and inventory reference.
 */
export class LocationsModule extends AppModule {
  readonly name = LOCATIONS_MODULE;
  readonly label = "Ubicaciones";
  readonly basePath = "/locations";

  register(router: Router): void {
    registerPermissions(LOCATIONS_MODULE, LOCATION_PERMISSIONS);
    registerLocationRoutes(router);
  }
}

export const locationsModule = new LocationsModule();
