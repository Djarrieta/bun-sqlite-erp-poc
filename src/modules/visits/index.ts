import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./visits.db.ts"; // side effect: ensure the visits tables exist
import { VISITS_MODULE, VISIT_PERMISSIONS } from "./visits.rules.ts";
import { registerVisitRoutes } from "./visits.routes.ts";

/**
 * The visits (bitácora) module: logs of visits to companies/projects. Web
 * visits carry manual text; audio visits are captured by the Telegram bot
 * (transcribed + summarized, with detected action items). Shared org-wide.
 */
export class VisitsModule extends AppModule {
  readonly name = VISITS_MODULE;
  readonly label = "Bitácoras";
  readonly basePath = "/visits";

  register(router: Router): void {
    registerPermissions(VISITS_MODULE, VISIT_PERMISSIONS);
    registerVisitRoutes(router);
  }
}

export const visitsModule = new VisitsModule();
