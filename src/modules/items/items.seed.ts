import { UserRepository } from "../../auth/auth.db.ts";
import { ItemRepository, type ItemInput } from "./items.db.ts";

/**
 * Development seed for the items module. The catalog is shared org-wide, so
 * items are created once (attributed to the primary dev account for audit) and
 * visible to everyone — run `seedUsers` first so an owner exists. Most items are
 * seeded `active` so the movements seed has stock to move. Idempotent: skips
 * when any items already exist.
 */
const SEED_OWNER_EMAIL = "djarrieta@erp.com";
const SEED_COUNT = 100;

const SAMPLE_NAMES = [
  "Widget",
  "Gadget",
  "Sprocket",
  "Bracket",
  "Fastener",
  "Coupling",
  "Bearing",
  "Flange",
];
const SAMPLE_TAGS = [
  "steel",
  "aluminium",
  "plastic",
  "imported",
  "fragile",
  "bulk",
  "premium",
];

function pick<T>(list: readonly T[]): T {
  return list[Math.floor(Math.random() * list.length)]!;
}

function randomTags(): string[] {
  const count = 1 + Math.floor(Math.random() * 3);
  const tags = new Set<string>();
  while (tags.size < count) tags.add(pick(SAMPLE_TAGS));
  return [...tags];
}

function randomItem(): ItemInput {
  // Bias toward "active" so the movements seed has plenty of movable stock,
  // while leaving a few draft/archived for list variety.
  const roll = Math.random();
  const status = roll < 0.8 ? "active" : roll < 0.9 ? "draft" : "archived";
  return {
    name: `${pick(SAMPLE_NAMES)} #${Math.floor(Math.random() * 1000)}`,
    tags: randomTags(),
    status,
    isUnique: Math.random() < 0.15,
  };
}

export function seedItems(): void {
  const users = new UserRepository();
  const owner = users.findByEmail(SEED_OWNER_EMAIL) ?? users.list()[0];
  if (!owner) {
    console.warn("   items: no user available to own items, skipping");
    return;
  }
  const items = new ItemRepository();
  if (items.list().total > 0) {
    console.log("   items: catalog already seeded, skipping");
    return;
  }
  for (let i = 0; i < SEED_COUNT; i++) items.create(randomItem(), owner.id);
  console.log(`   items: created ${SEED_COUNT} items (owner ${owner.email})`);
}
