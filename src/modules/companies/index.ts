import { AppModule } from "../../core/modules.ts";
import { registerPermissions } from "../../core/permissions.ts";
import type { Router } from "../../core/router.ts";
import "./companies.db.ts"; // side effect: ensure the companies table exists
import { COMPANIES_MODULE, COMPANY_PERMISSIONS } from "./companies.rules.ts";
import { registerCompanyRoutes } from "./companies.routes.ts";

/**
 * The companies module: manage the CRM directory of client/partner companies
 * that contacts and projects are linked to. Shared org-wide.
 */
export class CompaniesModule extends AppModule {
  readonly name = COMPANIES_MODULE;
  readonly label = "Compañías";
  readonly basePath = "/companies";

  register(router: Router): void {
    registerPermissions(COMPANIES_MODULE, COMPANY_PERMISSIONS);
    registerCompanyRoutes(router);
  }
}

export const companiesModule = new CompaniesModule();
