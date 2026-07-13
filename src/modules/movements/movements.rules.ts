import type { ModulePermissions } from "../../core/permissions.ts";
import type { InventoryRepository } from "../inventory/inventory.db.ts";
import type {
  Movement,
  MovementInput,
  MovementKind,
  MovementLineRow,
} from "./movements.db.ts";

/** Permission key for this module (used across views and routes). */
export const MOVEMENTS_MODULE = "movements";

/** All movement kinds, in display order. */
export const MOVEMENT_KINDS: readonly MovementKind[] = [
  "intake",
  "transfer",
  "dispatch",
];

/** All movement statuses, in display order. */
export const MOVEMENT_STATUSES = ["draft", "confirmed"] as const;

/**
 * Business rules: logistic and admin create/confirm/delete movements; everyone
 * else reads. `create` also covers CSV import; `update` covers confirming and
 * editing a draft; `read` covers CSV export.
 */
export const MOVEMENT_PERMISSIONS: ModulePermissions = {
  logistic: ["view", "create", "read", "update", "delete"],
  admin: ["view", "create", "read", "update", "delete"],
  sales: ["view", "read"],
  financial: ["view", "read"],
  engineer: ["view", "read"],
  member: ["view", "read"],
};

export interface ParsedMovementForm {
  input: MovementInput;
  errors: Record<string, string>;
}

function isKind(value: string): value is MovementKind {
  return (MOVEMENT_KINDS as readonly string[]).includes(value);
}

/** Parse a positive integer id from a form value, or null. */
function parseId(value: FormDataEntryValue | null): number | null {
  const n = Number(String(value ?? "").trim());
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Parse and validate the movement header form. Origin/destination requirements
 * depend on the kind: intake → destination only, dispatch → origin only,
 * transfer → both (and distinct). The irrelevant location for the kind is
 * forced to null so the DB CHECK constraint is always satisfied.
 */
export function parseMovementForm(form: FormData): ParsedMovementForm {
  const kindRaw = String(form.get("kind") ?? "transfer");
  const kind: MovementKind = isKind(kindRaw) ? kindRaw : "transfer";
  let originId = parseId(form.get("origin_id"));
  let destinationId = parseId(form.get("destination_id"));
  const notes = String(form.get("notes") ?? "").trim();

  const errors: Record<string, string> = {};
  if (!isKind(kindRaw)) errors.kind = "Tipo de movimiento inválido.";

  if (kind === "intake") {
    originId = null;
    if (!destinationId) errors.destination_id = "Selecciona el destino.";
  } else if (kind === "dispatch") {
    destinationId = null;
    if (!originId) errors.origin_id = "Selecciona el origen.";
  } else {
    if (!originId) errors.origin_id = "Selecciona el origen.";
    if (!destinationId) errors.destination_id = "Selecciona el destino.";
    if (originId && destinationId && originId === destinationId)
      errors.destination_id = "El origen y el destino deben ser distintos.";
  }

  if (notes.length > 500)
    errors.notes = "Las notas no pueden superar 500 caracteres.";

  return { input: { kind, originId, destinationId, notes }, errors };
}

/**
 * Validate a single line's quantity against an item. Enforces that only active
 * items are movable, quantities are positive integers, and unique items carry
 * exactly one unit. Returns an error message, or null when valid.
 */
export function validateLineQuantity(
  item: { is_unique: number; status: string },
  quantity: number
): string | null {
  if (item.status !== "active")
    return "El item no está activo y no se puede mover.";
  if (!Number.isInteger(quantity) || quantity <= 0)
    return "La cantidad debe ser un entero mayor a 0.";
  if (item.is_unique && quantity !== 1)
    return "El item es único: la cantidad debe ser 1.";
  return null;
}

/**
 * Validate a draft movement against current stock before confirming. Returns a
 * list of human-readable reasons; an empty list means it is safe to apply.
 * Enforces per-line rules plus the strong unique-item invariants (a unique item
 * lives in exactly one location, one unit system-wide) and stock sufficiency at
 * the origin for dispatch/transfer.
 */
export function validateConfirmation(
  movement: Movement,
  lines: MovementLineRow[],
  inventory: InventoryRepository
): string[] {
  const errors: string[] = [];
  for (const line of lines) {
    const label = `#${line.item_id} ${line.item_name}`;
    const lineError = validateLineQuantity(
      { is_unique: line.is_unique, status: line.item_status },
      line.quantity
    );
    if (lineError) errors.push(`${label}: ${lineError}`);

    if (line.is_unique) {
      if (movement.kind === "intake") {
        if (inventory.totalQuantity(line.item_id) !== 0)
          errors.push(`${label}: item único, ya existe stock en el sistema.`);
      } else if (movement.kind === "transfer") {
        if (inventory.getQuantity(line.item_id, movement.origin_id!) !== 1)
          errors.push(`${label}: item único, no está disponible en el origen.`);
        if (inventory.getQuantity(line.item_id, movement.destination_id!) !== 0)
          errors.push(`${label}: item único, el destino ya lo tiene.`);
      } else if (movement.kind === "dispatch") {
        if (inventory.getQuantity(line.item_id, movement.origin_id!) !== 1)
          errors.push(`${label}: item único, no está disponible en el origen.`);
      }
    } else if (movement.kind === "dispatch" || movement.kind === "transfer") {
      const have = inventory.getQuantity(line.item_id, movement.origin_id!);
      if (have < line.quantity)
        errors.push(
          `${label}: stock insuficiente en el origen (hay ${have}, se necesitan ${line.quantity}).`
        );
    }
  }
  return errors;
}
