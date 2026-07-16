import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./projects.db.ts"; // side effect: ensure the projects table exists
import { PROJECTS_MODULE, PROJECT_PERMISSIONS } from "./projects.rules.ts";
import { registerProjectRoutes } from "./projects.routes.ts";

/**
 * The projects module: CRM projects that belong to a company and gather
 * locations from the shared directory that equipment can be transferred to.
 * Shared org-wide.
 */
export class ProjectsModule extends AppModule {
  readonly name = PROJECTS_MODULE;
  readonly label = "Proyectos";
  readonly basePath = "/projects";

  register(router: Router): void {
    registerPermissions(PROJECTS_MODULE, PROJECT_PERMISSIONS);
    registerProjectRoutes(router);
  }
}

export const projectsModule = new ProjectsModule();
