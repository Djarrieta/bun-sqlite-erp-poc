import { UserRepository } from "../auth/auth.db.ts";
import { authService } from "../auth/auth.service.ts";

/**
 * Development seed for the users module. Creates the primary dev account.
 * Passwords are hashed through `authService` so seeded users log in normally.
 * Idempotent: skips creation when the account already exists.
 */
const SEED_USER = {
  email: "djarrieta@erp.com",
  password: "dariojose",
  role: "admin",
} as const;

export async function seedUsers(): Promise<void> {
  const users = new UserRepository();
  if (users.findByEmail(SEED_USER.email)) {
    console.log(`   users: ${SEED_USER.email} already exists, skipping`);
    return;
  }
  const result = await authService.createUser(
    SEED_USER.email,
    SEED_USER.password,
    SEED_USER.role
  );
  if (result.ok) console.log(`   users: created ${SEED_USER.email}`);
  else
    console.error(
      `   users: failed to create ${SEED_USER.email}: ${result.error}`
    );
}
