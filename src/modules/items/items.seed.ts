import { UserRepository } from "../auth/auth.db.ts";
import { ItemRepository, type ItemInput } from "./items.db.ts";
import { ITEM_STATUSES } from "./items.rules.ts";

/**
 * Development seed for the items module. Creates a few random items owned by
 * the primary dev account (falling back to the first user). Items are scoped by
 * `user_id`, so seeding needs an existing owner — run `seedUsers` first.
 * Idempotent: skips when the owner already has items.
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
  return {
    name: `${pick(SAMPLE_NAMES)} #${Math.floor(Math.random() * 1000)}`,
    tags: randomTags(),
    status: pick(ITEM_STATUSES),
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
  if (items.list(owner.id).length > 0) {
    console.log(`   items: ${owner.email} already has items, skipping`);
    return;
  }
  for (let i = 0; i < SEED_COUNT; i++) items.create(randomItem(), owner.id);
  console.log(`   items: created ${SEED_COUNT} items for ${owner.email}`);
}
