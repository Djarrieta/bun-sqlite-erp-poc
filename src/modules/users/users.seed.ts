import { UserRepository } from "../../auth/auth.db.ts";
import { authService } from "../../auth/auth.service.ts";
import type { Role } from "../../core/permissions.ts";

/**
 * Development seed for the users module. Creates the primary admin account from
 * `ADMIN_EMAIL` / `ADMIN_PASSWORD` — the same env vars and defaults used by
 * `authService.ensureAdmin`. Passwords are hashed through `authService` so the
 * account logs in normally. Idempotent: skips creation when it already exists.
 */
const SEED_USER = {
  email: (process.env.ADMIN_EMAIL ?? "").trim().toLowerCase(),
  password: process.env.ADMIN_PASSWORD ?? "",
  role: "admin",
} as const;

/**
 * Extra test accounts, one per non-admin role, so every permission set can be
 * exercised in development. They all reuse `ADMIN_PASSWORD` (the admin already
 * uses it) for easy login. Idempotent, like the admin above.
 */
const TEST_USERS: readonly { email: string; role: Role }[] = [
  { email: "comercial@erp.com", role: "sales" },
  { email: "finanzas@erp.com", role: "financial" },
  { email: "ingenieria@erp.com", role: "engineer" },
  { email: "logistica@erp.com", role: "logistic" },
  { email: "miembro@erp.com", role: "member" },
];

/**
 * Optional Telegram id linked to the seeded admin so they can use the bot.
 * Only users with a linked Telegram id may chat with the bot, so this is how
 * the first user gets access. Leave empty to skip linking.
 */
const ADMIN_TELEGRAM_ID = (process.env.ADMIN_TELEGRAM_ID ?? "").trim();

export async function seedUsers(): Promise<void> {
  const users = new UserRepository();
  if (users.findByEmail(SEED_USER.email)) {
    console.log(`   users: ${SEED_USER.email} already exists, skipping`);
  } else {
    const result = await authService.createUser(
      SEED_USER.email,
      SEED_USER.password,
      SEED_USER.role
    );
    if (result.ok) console.log(`   users: created ${SEED_USER.email}`);
    else {
      console.error(
        `   users: failed to create ${SEED_USER.email}: ${result.error}`
      );
      return;
    }
  }

  // Grant the admin bot access by linking their Telegram id (set
  // ADMIN_TELEGRAM_ID in .env). Idempotent: only writes when it changed.
  if (ADMIN_TELEGRAM_ID) {
    const admin = users.findByEmail(SEED_USER.email);
    if (admin && admin.telegram_id !== ADMIN_TELEGRAM_ID) {
      users.setTelegramId(admin.id, ADMIN_TELEGRAM_ID);
      console.log(
        `   users: linked Telegram id ${ADMIN_TELEGRAM_ID} to ${SEED_USER.email}`
      );
    }
  }

  // Test accounts (one per non-admin role) sharing ADMIN_PASSWORD.
  for (const test of TEST_USERS) {
    if (users.findByEmail(test.email)) {
      console.log(`   users: ${test.email} already exists, skipping`);
      continue;
    }
    const result = await authService.createUser(
      test.email,
      SEED_USER.password,
      test.role
    );
    if (result.ok)
      console.log(`   users: created ${test.email} (${test.role})`);
    else
      console.error(
        `   users: failed to create ${test.email}: ${result.error}`
      );
  }
}
