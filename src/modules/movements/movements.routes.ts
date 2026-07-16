import { attachment, forbidden, html, notFound, redirect } from "../../core/http.ts";
import type { RouteContext, Router } from "../../core/router.ts";
import { can } from "../../core/permissions.ts";
import { MovementRepository } from "./movements.db.ts";
import { ItemRepository } from "../items/items.db.ts";
import { InventoryRepository } from "../inventory/inventory.db.ts";
import { LocationRepository } from "../locations/locations.db.ts";
import {
  MOVEMENTS_MODULE,
  MOVEMENT_KINDS,
  parseMovementForm,
  validateLineQuantity,
} from "./movements.rules.ts";
import {
  parseMovementLinesCsv,
  serializeMovementLines,
} from "./movements.csv.ts";
import {
  lineSearchResults,
  movementCode,
  movementDetailPage,
  movementHeaderCard,
  movementLinesFragment,
  movementNewPage,
  movementsListPage,
  movementsResults,
  type MovementFilters,
  type MovementFormValues,
} from "./movements.views.ts";
import type { MovementInput, MovementKind } from "./movements.db.ts";

/**
 * Registers the movements module's routes. Movements read and write stock
 * through the inventory repository at confirmation time (transactional). Edit
 * routes guard `status = 'draft'`; confirmed movements are immutable.
 */
export function registerMovementRoutes(router: Router): void {
  const movements = new MovementRepository();
  const items = new ItemRepository();
  const inventory = new InventoryRepository();
  const locations = new LocationRepository();

  const locationOptions = () =>
    locations
      .activeList()
      .map((l) => ({ value: String(l.id), label: `${l.code} · ${l.name}` }));

  /** Re-render the detail's lines fragment (used by error/success responses). */
  const linesFragment = (
    movementId: number,
    user: RouteContext["user"],
    opts: { errors?: string[]; notice?: string },
    status = 400
  ) => {
    const movement = movements.get(movementId);
    if (!movement) return notFound();
    return html(
      movementLinesFragment(movement, movements.listLines(movementId), user, opts),
      status
    );
  };

  /** Add "invalid location" errors for ids that don't exist. */
  const checkLocations = (
    input: MovementInput,
    errors: Record<string, string>
  ) => {
    if (input.originId && !locations.get(input.originId))
      errors.origin_id = "Ubicación de origen inválida.";
    if (input.destinationId && !locations.get(input.destinationId))
      errors.destination_id = "Ubicación de destino inválida.";
  };

  // List — supports ?q=&kind=&status=&location=&page=. HTMX asks for just the
  // results fragment; a normal navigation gets the full page.
  router.get("/movements", ({ req, url, user }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "view")) return forbidden();
    const filters: MovementFilters = {
      q: url.searchParams.get("q") ?? "",
      kind: url.searchParams.get("kind") ?? "",
      status: url.searchParams.get("status") ?? "",
      location: url.searchParams.get("location") ?? "",
    };
    const page = Number(url.searchParams.get("page") ?? "1");
    const result = movements.list({
      q: filters.q,
      kind: filters.kind,
      status: filters.status,
      locationId: filters.location ? Number(filters.location) : undefined,
      page,
    });
    if (req.headers.get("HX-Request") === "true") {
      return html(movementsResults(result, filters));
    }
    return html(movementsListPage(result, filters, locationOptions(), user));
  });

  // New form — registered before "/movements/:id" so it isn't captured as an id.
  // Optional ?kind=&origin=&destination= prefill the form — e.g. the projects
  // module links here with kind=transfer&destination=<locationId> so equipment
  // can be moved straight to a project location.
  router.get("/movements/new", ({ url, user }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "create")) return forbidden();
    const kindParam = url.searchParams.get("kind") ?? "";
    const kind: MovementKind = (MOVEMENT_KINDS as readonly string[]).includes(
      kindParam
    )
      ? (kindParam as MovementKind)
      : "transfer";
    const validLoc = (raw: string | null): string => {
      const locId = Number(raw ?? "");
      return Number.isInteger(locId) && locId > 0 && locations.get(locId)
        ? String(locId)
        : "";
    };
    const values: MovementFormValues = {
      kind,
      originId: validLoc(url.searchParams.get("origin")),
      destinationId: validLoc(url.searchParams.get("destination")),
      notes: "",
    };
    return html(movementNewPage(user, locationOptions(), values));
  });

  // Create draft
  router.post("/movements", async ({ req, user }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "create")) return forbidden();
    const { input, errors } = parseMovementForm(await req.formData());
    checkLocations(input, errors);
    if (Object.keys(errors).length > 0) {
      const values: MovementFormValues = {
        kind: input.kind,
        originId: input.originId ? String(input.originId) : "",
        destinationId: input.destinationId ? String(input.destinationId) : "",
        notes: input.notes,
      };
      return html(movementNewPage(user, locationOptions(), values, errors), 400);
    }
    const movement = movements.create(input, user.id);
    return redirect(`/movements/${movement.id}`);
  });

  // Item picker (HTMX) — active items by id/name, only for drafts.
  router.get(
    "/movements/:id/lines/search",
    ({ url, user, params }: RouteContext) => {
      if (!can(user, MOVEMENTS_MODULE, "update")) return forbidden();
      const id = Number(params.id);
      const movement = movements.get(id);
      if (!movement) return notFound();
      if (movement.status !== "draft")
        return forbidden("El movimiento no es un borrador.");
      const q = url.searchParams.get("q") ?? "";
      const found = items.searchActive(q);
      const existing = new Set(movements.listLines(id).map((l) => l.item_id));
      return html(lineSearchResults(id, found, existing));
    }
  );

  // Add a line (HTMX) — only for drafts.
  router.post("/movements/:id/lines", async ({ req, user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    if (movement.status !== "draft")
      return forbidden("El movimiento no es un borrador.");

    const form = await req.formData();
    const itemId = Number(String(form.get("item_id") ?? ""));
    const quantity = Number(String(form.get("quantity") ?? ""));
    const item = Number.isInteger(itemId) ? items.get(itemId) : null;

    if (!item) return linesFragment(id, user, { errors: ["El item no existe."] });
    const lineError = validateLineQuantity(item, quantity);
    if (lineError)
      return linesFragment(id, user, {
        errors: [`#${item.id} ${item.name}: ${lineError}`],
      });
    if (movements.hasLine(id, itemId))
      return linesFragment(id, user, {
        errors: [`#${item.id} ${item.name}: ya está en el movimiento.`],
      });

    movements.addLine(id, itemId, quantity);
    return linesFragment(id, user, { notice: "Línea agregada." }, 200);
  });

  // Remove a line (HTMX) — only for drafts.
  router.delete(
    "/movements/:id/lines/:lineId",
    ({ user, params }: RouteContext) => {
      if (!can(user, MOVEMENTS_MODULE, "update")) return forbidden();
      const id = Number(params.id);
      const movement = movements.get(id);
      if (!movement) return notFound();
      if (movement.status !== "draft")
        return forbidden("El movimiento no es un borrador.");
      movements.deleteLine(id, Number(params.lineId));
      return linesFragment(id, user, { notice: "Línea eliminada." }, 200);
    }
  );

  // Import CSV lines (all-or-nothing) — only for drafts.
  router.post("/movements/:id/import", async ({ req, user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "create")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    if (movement.status !== "draft")
      return forbidden("El movimiento no es un borrador.");

    const form = await req.formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || file.size === 0)
      return linesFragment(id, user, { errors: ["Selecciona un archivo CSV."] });

    const parsed = parseMovementLinesCsv(await file.text());
    if (parsed.fatal) return linesFragment(id, user, { errors: [parsed.fatal] });
    if (parsed.rows.length === 0)
      return linesFragment(id, user, {
        errors: ["El archivo no tiene filas de datos."],
      });

    const errors: string[] = [];
    const valid: { itemId: number; quantity: number }[] = [];
    const seen = new Set<number>();
    for (const row of parsed.rows) {
      const at = `Fila ${row.rowNumber}`;
      if (row.itemId === null) {
        errors.push(`${at}: item_id inválido.`);
        continue;
      }
      if (row.quantity === null) {
        errors.push(`${at}: cantidad inválida.`);
        continue;
      }
      if (seen.has(row.itemId)) {
        errors.push(`${at}: item_id ${row.itemId} repetido en el archivo.`);
        continue;
      }
      seen.add(row.itemId);
      const item = items.get(row.itemId);
      if (!item) {
        errors.push(`${at}: el item #${row.itemId} no existe.`);
        continue;
      }
      const lineError = validateLineQuantity(item, row.quantity);
      if (lineError) {
        errors.push(`${at}: ${lineError}`);
        continue;
      }
      if (movements.hasLine(id, row.itemId)) {
        errors.push(`${at}: el item #${row.itemId} ya está en el borrador.`);
        continue;
      }
      valid.push({ itemId: row.itemId, quantity: row.quantity });
    }

    if (errors.length > 0) return linesFragment(id, user, { errors });

    movements.addLines(id, valid);
    return linesFragment(
      id,
      user,
      { notice: `Se importaron ${valid.length} línea(s).` },
      200
    );
  });

  // Export CSV lines.
  router.get("/movements/:id/export.csv", ({ user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "read")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    const csv = serializeMovementLines(movements.listLines(id));
    return attachment(
      csv,
      `movimiento-${movementCode(id)}.csv`,
      "text/csv; charset=utf-8"
    );
  });

  // Confirm — apply to inventory (transactional). Only for drafts.
  router.post("/movements/:id/confirm", ({ user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    const result = movements.confirm(id, inventory);
    if (result.ok) {
      return html("", 200, { "HX-Redirect": `/movements/${id}` });
    }
    return linesFragment(id, user, { errors: result.errors });
  });

  // Detail
  router.get("/movements/:id", ({ user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "read")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    const origin = movement.origin_id ? locations.get(movement.origin_id) : null;
    const destination = movement.destination_id
      ? locations.get(movement.destination_id)
      : null;
    const lines = movements.listLines(id);
    return html(
      movementDetailPage(
        movement,
        origin,
        destination,
        lines,
        locationOptions(),
        user
      )
    );
  });

  // Update header (locations/notes) — only for drafts; kind is fixed.
  router.put("/movements/:id", async ({ req, user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "update")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    if (movement.status !== "draft")
      return forbidden("No se puede editar un movimiento confirmado.");

    const form = await req.formData();
    form.set("kind", movement.kind); // kind is immutable after creation
    const { input, errors } = parseMovementForm(form);
    checkLocations(input, errors);
    if (Object.keys(errors).length > 0) {
      const withEdits = {
        ...movement,
        origin_id: input.originId,
        destination_id: input.destinationId,
        notes: input.notes,
      };
      return html(
        movementHeaderCard(withEdits, null, null, locationOptions(), user, {
          errors,
        }),
        400
      );
    }

    const updated = movements.updateHeader(id, input) ?? movement;
    const origin = updated.origin_id ? locations.get(updated.origin_id) : null;
    const destination = updated.destination_id
      ? locations.get(updated.destination_id)
      : null;
    return html(
      movementHeaderCard(updated, origin, destination, locationOptions(), user, {
        saved: true,
      })
    );
  });

  // Delete a draft (cascades to lines) — confirmed movements are immutable.
  router.delete("/movements/:id", ({ user, params }: RouteContext) => {
    if (!can(user, MOVEMENTS_MODULE, "delete")) return forbidden();
    const id = Number(params.id);
    const movement = movements.get(id);
    if (!movement) return notFound();
    if (movement.status !== "draft")
      return forbidden("No se puede eliminar un movimiento confirmado.");
    movements.deleteDraft(id);
    return html("", 200, { "HX-Redirect": "/movements" });
  });
}
