import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./reports.db.ts"; // side effect: ensure the reports table exists at load
import { REPORTS_MODULE, REPORT_PERMISSIONS } from "./reports.rules.ts";
import { registerReportRoutes } from "./reports.routes.ts";

/**
 * The reports module: users describe a report in natural language, an LLM
 * proposes a read-only SQL query and chart type, and saved reports are shown as
 * charts. Data visibility is enforced per user by the reporting catalog + the
 * read-only SQL engine. Shared org-wide; editing is limited to author/admin.
 */
export class ReportsModule extends AppModule {
  readonly name = REPORTS_MODULE;
  readonly label = "Reportes";
  readonly basePath = "/reports";

  register(router: Router): void {
    registerPermissions(REPORTS_MODULE, REPORT_PERMISSIONS);
    registerReportRoutes(router);
  }
}

export const reportsModule = new ReportsModule();
