import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import type { SelectOption } from "../../components/index.ts";
import { CompanyRepository } from "../companies/companies.db.ts";
import { LocationRepository } from "../locations/locations.db.ts";
import { InventoryRepository } from "../inventory/inventory.db.ts";
import { MOVEMENTS_MODULE } from "../movements/movements.rules.ts";
import { ProjectRepository } from "./projects.db.ts";
import { PROJECTS_MODULE, parseProjectForm } from "./projects.rules.ts";
import {
  projectDetailPage,
  projectFormFragment,
  projectLocationsSection,
  projectNewPage,
  projectsListPage,
  projectsResults,
  type ProjectLocationRow,
} from "./projects.views.ts";

/**
 * Registers the projects module's routes. Projects are shared org-wide and
 * belong to a company. A project also gathers locations (from the shared
 * locations directory) that equipment can be transferred to via the movements
 * module. Managing that link and the equipment shortcut live here.
 */
export function registerProjectRoutes(router: Router): void {
  const projects = new ProjectRepository();
  const companies = new CompanyRepository();
  const locations = new LocationRepository();
  const inventory = new InventoryRepository();

  /** Active companies as `{ value, label }`, optionally including `currentId`. */
  const companyOptions = (currentId?: number | null): SelectOption[] => {
    const list = companies.activeList();
    const opts = list.map((c) => ({
      value: String(c.id),
      label: `${c.code} · ${c.name}`,
    }));
    if (currentId && !list.some((c) => c.id === currentId)) {
      const current = companies.get(currentId);
      if (current)
        opts.unshift({
          value: String(current.id),
          label: `${current.code} · ${current.name}`,
        });
    }
    return opts;
  };

  /** Build the "Ubicaciones del proyecto" HTMX section for a project. */
  const locationsSection = (
    projectId: number,
    user: RouteContext["user"]
  ): string => {
    const rows: ProjectLocationRow[] = locations
      .listByProject(projectId)
      .map((location) => ({
        location,
        units: inventory.totalUnitsAtLocation(location.id),
      }));
    const unassignedOptions = locations
      .activeUnassigned()
      .map((l) => ({ value: String(l.id), label: `${l.code} · ${l.name}` }));
    return projectLocationsSection(projectId, rows, unassignedOptions, {
      canManage: can(user, PROJECTS_MODULE, "update"),
      canCreateMovement: can(user, MOVEMENTS_MODULE, "create"),
    });
  };

  // List — supports ?q=&status=&company=&page=. HTMX asks for the results
  // fragment; a normal navigation gets the full page.
  router.get("/projects", ({ req, url, user }: RouteContext) => {
    if (!can(user, PROJECTS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      status: url.searchParams.get("status") ?? "",
      company: url.searchParams.get("company") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = projects.list({
      q: filters.q,
      status: filters.status,
      companyId: filters.company ? Number(filters.company) : undefined,
      page,
    });
    if (req.headers.get("HX-Request") === "true") {
      return html(projectsResults(result, filters, companyOptions()));
    }
    return html(projectsListPage(result, filters, companyOptions(), user));
  });

  // New form — registered before "/projects/:id" so it isn't captured as an id.
  // Supports ?company=<id> to prefill the company (e.g. from a company page).
  router.get("/projects/new", ({ url, user }: RouteContext) => {
    if (!can(user, PROJECTS_MODULE, "create")) return forbidden();
    const companyParam = Number(url.searchParams.get("company") ?? "");
    const prefill =
      Number.isInteger(companyParam) && companies.get(companyParam)
        ? String(companyParam)
        : "";
    return html(
      projectNewPage(user, companyOptions(companyParam || undefined), {
        code: "",
        name: "",
        companyId: prefill,
        status: "prospect",
        startDate: "",
        endDate: "",
        description: "",
      })
    );
  });

  // Create
  router.post("/projects", async ({ req, user }: RouteContext) => {
    if (!can(user, PROJECTS_MODULE, "create")) return forbidden();
    const { input, errors } = parseProjectForm(await req.formData());
    if (!errors.company_id && !companies.get(input.companyId)) {
      errors.company_id = "La compañía seleccionada no existe.";
    }
    if (!errors.code && projects.getByCode(input.code)) {
      errors.code = "Ya existe un proyecto con ese código.";
    }
    if (Object.keys(errors).length > 0) {
      return html(
        projectNewPage(
          user,
          companyOptions(input.companyId || undefined),
          {
            code: input.code,
            name: input.name,
            companyId: input.companyId ? String(input.companyId) : "",
            status: input.status,
            startDate: input.startDate,
            endDate: input.endDate,
            description: input.description,
          },
          errors
        ),
        400
      );
    }
    const project = projects.create(input, user.id);
    return redirect(`/projects/${project.id}`);
  });

  // Detail
  router.get("/projects/:id", ({ user, params }: RouteContext) => {
    if (!can(user, PROJECTS_MODULE, "read")) return forbidden();
    const project = projects.get(Number(params.id));
    if (!project) return notFound();
    const company = companies.get(project.company_id);
    return html(
      projectDetailPage(
        project,
        company?.name ?? "—",
        user,
        companyOptions(project.company_id),
        locationsSection(project.id, user)
      )
    );
  });

  // Update
  router.put("/projects/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, PROJECTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = projects.get(id);
    if (!existing) return notFound();

    const { input, errors } = parseProjectForm(await req.formData());
    if (!errors.company_id && !companies.get(input.companyId)) {
      errors.company_id = "La compañía seleccionada no existe.";
    }
    const clash = !errors.code ? projects.getByCode(input.code) : null;
    if (clash && clash.id !== id) {
      errors.code = "Ya existe un proyecto con ese código.";
    }
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        code: input.code,
        name: input.name,
        company_id: input.companyId,
        status: input.status,
        start_date: input.startDate,
        end_date: input.endDate,
        description: input.description,
      };
      return html(
        projectFormFragment(withEdits, user, companyOptions(input.companyId), {
          errors,
        }),
        400
      );
    }

    const updated = projects.update(id, input) ?? existing;
    return html(
      projectFormFragment(updated, user, companyOptions(updated.company_id), {
        saved: true,
      })
    );
  });

  // Link an existing (active, unassigned) location to the project.
  router.post(
    "/projects/:id/locations",
    async ({ req, user, params }: RouteContext) => {
      if (!can(user, PROJECTS_MODULE, "update")) return forbidden();
      const id = Number(params.id);
      const project = projects.get(id);
      if (!project) return notFound();

      const form = await req.formData();
      const locationId = Number(String(form.get("location_id") ?? ""));
      const location = Number.isInteger(locationId)
        ? locations.get(locationId)
        : null;
      // Only link an active location that isn't already tied to a project.
      if (location && location.is_active === 1 && location.project_id === null) {
        locations.assignProject(locationId, id);
      }
      return html(locationsSection(id, user));
    }
  );

  // Unlink a location from the project (only if it belongs to this project).
  router.delete(
    "/projects/:id/locations/:locId",
    ({ user, params }: RouteContext) => {
      if (!can(user, PROJECTS_MODULE, "update")) return forbidden();
      const id = Number(params.id);
      const project = projects.get(id);
      if (!project) return notFound();
      const locId = Number(params.locId);
      const location = locations.get(locId);
      if (location && location.project_id === id) {
        locations.assignProject(locId, null);
      }
      return html(locationsSection(id, user));
    }
  );
}
