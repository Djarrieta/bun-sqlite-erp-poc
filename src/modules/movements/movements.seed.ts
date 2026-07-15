import { UserRepository } from "../../auth/auth.db.ts";
import { ItemRepository } from "../items/items.db.ts";
import { LocationRepository } from "../locations/locations.db.ts";
import { InventoryRepository } from "../inventory/inventory.db.ts";
import { MovementRepository } from "./movements.db.ts";

/**
 * Development seed for the movements module. Because inventory only changes when
 * a movement is confirmed, this seed *creates and confirms* a few intake
 * movements (to bring stock into the system), a transfer, and leaves one draft
 * for UI variety. Run after users, items and locations are seeded. Idempotent:
 * skips when any movements already exist.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";

interface Line {
  itemId: number;
  quantity: number;
}

export function seedMovements(): void {
  const movements = new MovementRepository();
  if (movements.list().total > 0) {
    console.log("   movements: already seeded, skipping");
    return;
  }

  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  const locations = new LocationRepository();
  const inventory = new InventoryRepository();
  const items = new ItemRepository();

  const locs = locations.activeList();
  if (!owner || locs.length === 0) {
    console.warn("   movements: need a user and active locations, skipping");
    return;
  }

  const warehouses = locs.filter((l) => l.kind === "warehouse");
  const wh1 = warehouses[0] ?? locs[0]!;
  const wh2 = warehouses[1] ?? wh1;
  const store = locs.find((l) => l.kind === "store") ?? locs[locs.length - 1]!;

  const active = items.searchActive("", 60);
  const nonUnique = active.filter((i) => !i.is_unique);
  const unique = active.filter((i) => i.is_unique);
  if (nonUnique.length === 0) {
    console.warn("   movements: no active items to move, skipping");
    return;
  }

  const intake1Items = nonUnique.slice(0, 12);
  const intake2Items = nonUnique.slice(12, 20);

  /** Create a movement, add its lines and confirm it. Returns success. */
  const createConfirmed = (
    kind: "intake" | "transfer" | "dispatch",
    originId: number | null,
    destinationId: number | null,
    lines: Line[]
  ): boolean => {
    if (lines.length === 0) return false;
    const m = movements.create(
      { kind, originId, destinationId, notes: "" },
      owner.id
    );
    movements.addLines(m.id, lines);
    const res = movements.confirm(m.id, inventory);
    if (!res.ok)
      console.warn(`   movements: seed confirm failed — ${res.errors.join("; ")}`);
    return res.ok;
  };

  let confirmed = 0;

  // Intake 1 → wh1: stock for a batch of items plus a few unique items.
  if (
    createConfirmed("intake", null, wh1.id, [
      ...intake1Items.map((i) => ({ itemId: i.id, quantity: 25 })),
      ...unique.slice(0, 3).map((i) => ({ itemId: i.id, quantity: 1 })),
    ])
  )
    confirmed++;

  // Intake 2 → wh2: stock for a second batch.
  if (
    createConfirmed(
      "intake",
      null,
      wh2.id,
      intake2Items.map((i) => ({ itemId: i.id, quantity: 40 }))
    )
  )
    confirmed++;

  // Transfer wh1 → store: move a few units of items already stocked at wh1.
  if (wh1.id !== store.id) {
    if (
      createConfirmed(
        "transfer",
        wh1.id,
        store.id,
        intake1Items.slice(0, 3).map((i) => ({ itemId: i.id, quantity: 5 }))
      )
    )
      confirmed++;
  }

  // Draft transfer wh1 → store (left unconfirmed) for UI variety.
  let drafts = 0;
  if (wh1.id !== store.id && intake1Items.length >= 5) {
    const draft = movements.create(
      { kind: "transfer", originId: wh1.id, destinationId: store.id, notes: "Pendiente de revisión" },
      owner.id
    );
    movements.addLines(
      draft.id,
      intake1Items.slice(3, 5).map((i) => ({ itemId: i.id, quantity: 3 }))
    );
    drafts++;
  }

  console.log(
    `   movements: confirmed ${confirmed} movement(s), ${drafts} draft(s)`
  );
}
