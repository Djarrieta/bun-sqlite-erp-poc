import { forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { ItemRepository } from "./items.db.ts";
import { ITEMS_MODULE, parseItemForm } from "./items.rules.ts";
import {
  itemDetailPage,
  itemFormFragment,
  itemNewPage,
  itemsListPage,
  itemsResults,
} from "./items.views.ts";

/**
 * Registers the items module's routes. Every handler checks the user's business
 * rules via `can(...)` before reading or mutating data, and all queries are
 * scoped to `user.id` so users only ever touch their own items.
 */
export function registerItemRoutes(router: Router): void {
  const items = new ItemRepository();

  // List — supports ?q=<search>&status=&tag=&page=<n>. HTMX (search box,
  // filters, paging) asks for just the results fragment; a normal navigation
  // gets the full page (which also renders the search + filter controls).
  router.get("/items", ({ req, url, user }: RouteContext) => {
    if (!can(user, ITEMS_MODULE, "view")) return forbidden();
    // Default to the "active" status on a first visit (no `status` param yet);
    // once the toolbar form has submitted, an explicit empty value = "Todos".
    const status = url.searchParams.has("status")
      ? url.searchParams.get("status") ?? ""
      : "active";
    const filters = {
      q: url.searchParams.get("q") ?? "",
      status,
      tags: url.searchParams.getAll("tag"),
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = items.list(user.id, { ...filters, page });
    if (req.headers.get("HX-Request") === "true") {
      return html(itemsResults(result, filters));
    }
    return html(
      itemsListPage(result, filters, items.distinctTags(user.id), user)
    );
  });

  // New form — registered before "/items/:id" so it isn't captured as an id.
  router.get("/items/new", ({ user }: RouteContext) => {
    if (!can(user, ITEMS_MODULE, "create")) return forbidden();
    return html(itemNewPage(user));
  });

  // Create
  router.post("/items", async ({ req, user }: RouteContext) => {
    if (!can(user, ITEMS_MODULE, "create")) return forbidden();
    const { input, errors } = parseItemForm(await req.formData());
    if (Object.keys(errors).length > 0) {
      return html(
        itemNewPage(
          user,
          { name: input.name, tags: input.tags.join(", "), status: input.status },
          errors
        ),
        400
      );
    }
    const item = items.create(input, user.id);
    return redirect(`/items/${item.id}`);
  });

  // Detail
  router.get("/items/:id", ({ user, params }: RouteContext) => {
    if (!can(user, ITEMS_MODULE, "read")) return forbidden();
    const item = items.get(Number(params.id), user.id);
    if (!item) return notFound();
    return html(itemDetailPage(item, user));
  });

  // Update
  router.put("/items/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, ITEMS_MODULE, "update")) return forbidden();
    const existing = items.get(Number(params.id), user.id);
    if (!existing) return notFound();

    const { input, errors } = parseItemForm(await req.formData());
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...existing,
        name: input.name,
        tags: input.tags.join(","),
        status: input.status,
      };
      return html(itemFormFragment(withEdits, user, { errors }), 400);
    }

    const updated = items.update(Number(params.id), input, user.id) ?? existing;
    return html(itemFormFragment(updated, user, { saved: true }));
  });

  // Delete — tell HTMX to navigate back to the list.
  router.delete("/items/:id", ({ user, params }: RouteContext) => {
    if (!can(user, ITEMS_MODULE, "delete")) return forbidden();
    items.delete(Number(params.id), user.id);
    return html("", 200, { "HX-Redirect": "/items" });
  });
}
