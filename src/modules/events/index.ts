import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./events.db.ts"; // side effect: ensure the events tables exist
import { EVENTS_MODULE, EVENT_PERMISSIONS } from "./events.rules.ts";
import { registerEventRoutes } from "./events.routes.ts";

/**
 * The events module: any user can create events and tag other users or roles,
 * and sees events they created or were assigned to. Adding it to the server
 * (via `registerModule`) wires up its permissions, routes, and navigation entry.
 */
export class EventsModule extends AppModule {
  readonly name = EVENTS_MODULE;
  readonly label = "Eventos";
  readonly basePath = "/events";

  register(router: Router): void {
    registerPermissions(EVENTS_MODULE, EVENT_PERMISSIONS);
    registerEventRoutes(router);
  }
}

export const eventsModule = new EventsModule();
