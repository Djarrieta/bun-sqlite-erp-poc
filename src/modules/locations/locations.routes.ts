import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { LocationRepository } from "./locations.db.ts";
import { LOCATIONS_MODULE, parseLocationForm } from "./locations.rules.ts";
import {
  locationDetailPage,
  locationFormFragment,
  locationNewPage,
  locationsListPage,
  locationsResults,
} from "./locations.views.ts";

/**
 * Registers the locations module's routes. Every handler checks the user's
 * business rules via `can(...)`. The directory is shared org-wide (no per-user
 * scoping). Locations are never hard-deleted — they are archived via `is_active`.
 */
export function registerLocationRoutes(router: Router): void {
  const locations = new LocationRepository();

  // List — supports ?q=<search>&kind=&active=&page=<n>. HTMX asks for just the
  // results fragment; a normal navigation gets the full page.
  router.get("/locations", ({ req, url, user }: RouteContext) => {
    if (!can(user, LOCATIONS_MODULE, "view")) return forbidden();
    const filters = {
      q: url.searchParams.get("q") ?? "",
      kind: url.searchParams.get("kind") ?? "",
      active: url.searchParams.get("active") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = locations.list({ ...filters, page });
    if (req.headers.get("HX-Request") === "true") {
      return html(locationsResults(result, filters));
    }
    return html(locationsListPage(result, filters, user));
  });

  // New form — registered before "/locations/:id" so it isn't captured as an id.
  router.get("/locations/new", ({ user }: RouteContext) => {
    if (!can(user, LOCATIONS_MODULE, "create")) return forbidden();
    return html(locationNewPage(user));
  });

  // Create
  router.post("/locations", async ({ req, user }: RouteContext) => {
    if (!can(user, LOCATIONS_MODULE, "create")) return forbidden();
    const { input, errors } = parseLocationForm(await req.formData());
    if (!errors.code && locations.getByCode(input.code)) {
      errors.code = "Ya existe una ubicación con ese código.";
    }
    if (Object.keys(errors).length > 0) {
      return html(
        locationNewPage(
          user,
          {
            code: input.code,
            name: input.name,
            kind: input.kind,
            isActive: input.isActive,
          },
          errors
        ),
        400
      );
    }
    const location = locations.create(input);
    return redirect(`/locations/${location.id}`);
  });

  // Detail
  router.get("/locations/:id", ({ user, params }: RouteContext) => {
    if (!can(user, LOCATIONS_MODULE, "read")) return forbidden();
    const location = locations.get(Number(params.id));
    if (!location) return notFound();
    return html(locationDetailPage(location, user));
  });

  // Update — also archives/reactivates via the is_active field.
  router.put("/locations/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, LOCATIONS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const existing = locations.get(id);
    if (!existing) return notFound();

    const { input, errors } = parseLocationForm(await req.formData());
    const clash = !errors.code ? locations.getByCode(input.code) : null;
    if (clash && clash.id !== id) {
      errors.code = "Ya existe una ubicación con ese código.";
    }
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        code: input.code,
        name: input.name,
        kind: input.kind,
        is_active: input.isActive ? 1 : 0,
      };
      return html(locationFormFragment(withEdits, user, { errors }), 400);
    }

    const updated = locations.update(id, input) ?? existing;
    return html(locationFormFragment(updated, user, { saved: true }));
  });
}
