import { attachment, forbidden, html } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { serializeCsv } from "../../core/csv.ts";
import { InventoryRepository, type InventoryListParams } from "./inventory.db.ts";
import { LocationRepository } from "../locations/locations.db.ts";
import { INVENTORY_MODULE } from "./inventory.rules.ts";
import {
  inventoryListPage,
  inventoryResults,
  type InventoryFilters,
} from "./inventory.views.ts";

/** Read the shared filters (search + location) from the query string. */
function readFilters(url: URL): {
  filters: InventoryFilters;
  params: InventoryListParams;
} {
  const q = url.searchParams.get("q") ?? "";
  const location = url.searchParams.get("location") ?? "";
  const locationId = location ? Number(location) : undefined;
  return {
    filters: { q, location },
    params: { q, locationId },
  };
}

/**
 * Registers the inventory module's routes. Inventory is read-only from the UI —
 * balances are written by confirmed movements. Exposes a list and a CSV export.
 */
export function registerInventoryRoutes(router: Router): void {
  const inventory = new InventoryRepository();
  const locations = new LocationRepository();

  // Export — registered before the list so its literal path is never shadowed.
  router.get("/inventory/export.csv", ({ url, user }: RouteContext) => {
    if (!can(user, INVENTORY_MODULE, "read")) return forbidden();
    const { params } = readFilters(url);
    const rows = inventory.exportRows(params);
    const csv = serializeCsv([
      ["location_code", "item_id", "item_name", "quantity"],
      ...rows.map((r) => [
        r.location_code,
        String(r.item_id),
        r.item_name,
        String(r.quantity),
      ]),
    ]);
    return attachment(csv, "inventario.csv", "text/csv; charset=utf-8");
  });

  // List — supports ?q=<search>&location=<id>&page=<n>. HTMX asks for just the
  // results fragment; a normal navigation gets the full page.
  router.get("/inventory", ({ req, url, user }: RouteContext) => {
    if (!can(user, INVENTORY_MODULE, "view")) return forbidden();
    const { filters, params } = readFilters(url);
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = inventory.list({ ...params, page });
    if (req.headers.get("HX-Request") === "true") {
      return html(inventoryResults(result, filters));
    }
    const locationOptions = locations
      .activeList()
      .map((l) => ({ value: String(l.id), label: `${l.code} · ${l.name}` }));
    return html(inventoryListPage(result, filters, locationOptions, user));
  });
}
