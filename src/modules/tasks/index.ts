import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./tasks.db.ts"; // side effect: ensure the tasks table exists
import { TASKS_MODULE, TASK_PERMISSIONS } from "./tasks.rules.ts";
import { registerTaskRoutes } from "./tasks.routes.ts";

/**
 * The tasks module: lightweight to-dos anyone can create and assign. Per-viewer
 * (row-scoped): a user only sees tasks they created or were assigned to. Action
 * items detected on a visit (bitácora) are turned into tasks here.
 */
export class TasksModule extends AppModule {
  readonly name = TASKS_MODULE;
  readonly label = "Tareas";
  readonly basePath = "/tasks";

  register(router: Router): void {
    registerPermissions(TASKS_MODULE, TASK_PERMISSIONS);
    registerTaskRoutes(router);
  }
}

export const tasksModule = new TasksModule();
