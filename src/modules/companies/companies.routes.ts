import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { CompanyRepository } from "./companies.db.ts";
import { COMPANIES_MODULE, parseCompanyForm } from "./companies.rules.ts";
import {
  companyDetailPage,
  companyFormFragment,
  companyNewPage,
  companiesListPage,
  companiesResults,
} from "./companies.views.ts";
import { companyRelatedSections } from "./companies.related.ts";

/**
 * Registers the companies module's routes. Every handler checks the user's
 * business rules via `can(...)`. The directory is shared org-wide (no per-user
 * scoping). Companies are never hard-deleted — they are archived via `is_active`.
 */
export function registerCompanyRoutes(router: Router): void {
  const companies = new CompanyRepository();

  // List — supports ?q=<search>&active=&page=<n>. HTMX asks for just the
  // results fragment; a normal navigation gets the full page.
  router.get("/companies", ({ req, url, user }: RouteContext) => {
    if (!can(user, COMPANIES_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      active: url.searchParams.get("active") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = companies.list({ ...filters, page });
    if (req.headers.get("HX-Request") === "true") {
      return html(companiesResults(result, filters));
    }
    return html(companiesListPage(result, filters, user));
  });

  // New form — registered before "/companies/:id" so it isn't captured as an id.
  router.get("/companies/new", ({ user }: RouteContext) => {
    if (!can(user, COMPANIES_MODULE, "create")) return forbidden();
    return html(companyNewPage(user));
  });

  // Create
  router.post("/companies", async ({ req, user }: RouteContext) => {
    if (!can(user, COMPANIES_MODULE, "create")) return forbidden();
    const { input, errors } = parseCompanyForm(await req.formData());
    if (!errors.code && companies.getByCode(input.code)) {
      errors.code = "Ya existe una compañía con ese código.";
    }
    if (Object.keys(errors).length > 0) {
      return html(companyNewPage(user, { ...input }, errors), 400);
    }
    const company = companies.create(input, user.id);
    return redirect(`/companies/${company.id}`);
  });

  // Detail — includes related contacts + projects sections.
  router.get("/companies/:id", ({ user, params }: RouteContext) => {
    if (!can(user, COMPANIES_MODULE, "read")) return forbidden();
    const company = companies.get(Number(params.id));
    if (!company) return notFound();
    return html(
      companyDetailPage(company, user, companyRelatedSections(company.id, user))
    );
  });

  // Update — also archives/reactivates via the is_active field.
  router.put("/companies/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, COMPANIES_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = companies.get(id);
    if (!existing) return notFound();

    const { input, errors } = parseCompanyForm(await req.formData());
    const clash = !errors.code ? companies.getByCode(input.code) : null;
    if (clash && clash.id !== id) {
      errors.code = "Ya existe una compañía con ese código.";
    }
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        code: input.code,
        name: input.name,
        industry: input.industry,
        website: input.website,
        phone: input.phone,
        email: input.email,
        is_active: input.isActive ? 1 : 0,
        notes: input.notes,
      };
      return html(companyFormFragment(withEdits, user, { errors }), 400);
    }

    const updated = companies.update(id, input) ?? existing;
    return html(companyFormFragment(updated, user, { saved: true }));
  });
}
