import type { Role } from "../core/permissions.ts";
import {
  SessionRepository,
  UserRepository,
  type User,
} from "./auth.db.ts";
import { MIN_PASSWORD, isValidEmail } from "./auth.rules.ts";

/**
 * Auth business logic.
 *
 * Auth centralizes hashing, session lifecycle, and token handling behind this
 * service so routes never touch SQL or crypto. It is exposed as the
 * `authService` singleton below.
 */

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 1 day

const isProd = process.env.NODE_ENV === "production";

/**
 * A valid Argon2id hash of a random secret, used to keep login timing uniform
 * when the email is unknown (we still run a real verify). Generated lazily so
 * it always matches the current runtime's parameters — a hard-coded hash can be
 * rejected by newer Bun versions as `WeakParameters`.
 */
let dummyHashPromise: Promise<string> | null = null;
function getDummyHash(): Promise<string> {
  return (dummyHashPromise ??= Bun.password.hash(crypto.randomUUID()));
}


export interface AuthResult {
  ok: boolean;
  user?: User;
  error?: string;
}

/**
 * Application service that owns all authentication + account business rules.
 * Composes the user/session/reset repositories and the password hasher so
 * routes never touch SQL or crypto directly.
 */
export class AuthService {
  constructor(
    private readonly users = new UserRepository(),
    private readonly sessions = new SessionRepository()
  ) {}

  /**
   * Seed the very first admin when the users table is empty. There is no public
   * registration, so this bootstrap is the only way the initial account exists.
   * Credentials come from `ADMIN_EMAIL` / `ADMIN_PASSWORD`, with dev defaults.
   */
  async ensureAdmin(): Promise<void> {
    if (this.users.count() > 0) return;
    const email = (process.env.ADMIN_EMAIL ?? "admin@example.com")
      .trim()
      .toLowerCase();
    const password = process.env.ADMIN_PASSWORD ?? "changeme8";
    const result = await this.createUser(email, password, "admin");
    if (result.ok) {
      console.log(`👤 Seeded initial admin: ${email}`);
      if (!isProd)
        console.log(`   Temporary password: ${password} (change it after login)`);
    } else {
      console.error(`Failed to seed admin: ${result.error}`);
    }
  }

  /** Create a user with an explicit role (used by admins and the seed). */
  async createUser(
    email: string,
    password: string,
    role: Role
  ): Promise<AuthResult> {
    email = email.trim().toLowerCase();
    if (!isValidEmail(email)) return { ok: false, error: "Correo inválido." };
    if (password.length < MIN_PASSWORD)
      return {
        ok: false,
        error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      };
    if (this.users.findByEmail(email))
      return { ok: false, error: "Ese correo ya está registrado." };

    const passwordHash = await Bun.password.hash(password);
    const user = this.users.create(email, passwordHash, role);
    return { ok: true, user };
  }

  /** Verify credentials and return the matching user, or an error. */
  async login(email: string, password: string): Promise<AuthResult> {
    email = email.trim().toLowerCase();
    const user = this.users.findByEmail(email);
    // Verify even when the user is missing to keep timing uniform.
    const hash = user?.password_hash ?? (await getDummyHash());
    const valid = await Bun.password.verify(password, hash);
    if (!user || !valid)
      return { ok: false, error: "Correo o contraseña incorrectos." };
    return { ok: true, user };
  }

  /** Change a logged-in user's password after verifying the current one. */
  async changePassword(
    userId: number,
    current: string,
    next: string
  ): Promise<AuthResult> {
    if (next.length < MIN_PASSWORD)
      return {
        ok: false,
        error: `La nueva contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      };
    const user = this.users.findById(userId);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    const valid = await Bun.password.verify(current, user.password_hash);
    if (!valid)
      return { ok: false, error: "La contraseña actual es incorrecta." };
    const passwordHash = await Bun.password.hash(next);
    this.users.updatePassword(userId, passwordHash);
    return { ok: true, user };
  }

  /**
   * Admin override: set a new temporary password for another user without
   * knowing the current one. Every existing session for that user is
   * invalidated so the new password takes effect immediately.
   */
  async adminSetPassword(userId: number, next: string): Promise<AuthResult> {
    if (next.length < MIN_PASSWORD)
      return {
        ok: false,
        error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      };
    const user = this.users.findById(userId);
    if (!user) return { ok: false, error: "Usuario no encontrado." };
    const passwordHash = await Bun.password.hash(next);
    this.users.updatePassword(userId, passwordHash);
    this.sessions.deleteByUser(userId);
    return { ok: true, user };
  }

  // --- Sessions --------------------------------------------------------

  createSession(userId: number): string {
    // Opportunistic housekeeping: drop already-expired rows at this natural
    // write point so the table doesn't accumulate dead sessions over time.
    // (Expiry is still enforced on every read in `SessionRepository.findUser`.)
    this.sessions.deleteExpired();
    const id = crypto.randomUUID();
    const expiresAt = new Date(Date.now() + SESSION_TTL_MS).toISOString();
    this.sessions.create(id, userId, expiresAt);
    return id;
  }

  destroySession(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  getSessionId(req: Request): string | null {
    return parseCookies(req.headers.get("cookie"))[SESSION_COOKIE] ?? null;
  }

  /** Resolve the authenticated user from the request's session cookie. */
  getUserFromRequest(req: Request): User | null {
    const sessionId = this.getSessionId(req);
    if (!sessionId) return null;
    return this.sessions.findUser(sessionId);
  }

  sessionCookie(sessionId: string): string {
    const maxAge = Math.floor(SESSION_TTL_MS / 1000);
    const secure = isProd ? " Secure;" : "";
    return `${SESSION_COOKIE}=${sessionId}; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=${maxAge}`;
  }

  clearSessionCookie(): string {
    const secure = isProd ? " Secure;" : "";
    return `${SESSION_COOKIE}=; HttpOnly;${secure} SameSite=Lax; Path=/; Max-Age=0`;
  }
}

function parseCookies(header: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (key) out[key] = decodeURIComponent(value);
  }
  return out;
}

/** Shared singleton used across the app. */
export const authService = new AuthService();
