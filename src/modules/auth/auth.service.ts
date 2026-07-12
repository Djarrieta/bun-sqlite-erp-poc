import type { Role } from "../../core/permissions.ts";
import {
  PasswordResetRepository,
  SessionRepository,
  UserRepository,
  type User,
} from "./auth.db.ts";
import { MIN_PASSWORD, isValidEmail } from "./auth.rules.ts";

/**
 * Auth business logic.
 *
 * DIVERGENCE FROM THE MODULE PATTERN: typical modules have their routes talk to
 * a repository directly (see `items.routes.ts`). Auth centralizes hashing,
 * session lifecycle, and token handling behind this service so routes never
 * touch SQL or crypto. It is exposed as the `authService` singleton below.
 */

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

const isProd = process.env.NODE_ENV === "production";

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
    private readonly sessions = new SessionRepository(),
    private readonly resets = new PasswordResetRepository()
  ) {}

  /** Register a new account. The very first user becomes an admin. */
  async register(email: string, password: string): Promise<AuthResult> {
    const role: Role = this.users.count() === 0 ? "admin" : "member";
    return this.createUser(email, password, role);
  }

  /** Create a user with an explicit role (used by admins and by register). */
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
    const hash =
      user?.password_hash ?? "$argon2id$v=19$m=65536,t=2,p=1$aaaa$aaaa";
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
   * Begin a forgot-password flow. Returns the token so a caller can surface it
   * in development; in production it would be emailed instead. Returns a null
   * token when the email is unknown (callers should still show a generic
   * message to avoid leaking which emails exist).
   */
  requestPasswordReset(email: string): { token: string | null } {
    email = email.trim().toLowerCase();
    const user = this.users.findByEmail(email);
    if (!user) return { token: null };
    const token = crypto.randomUUID() + crypto.randomUUID().replaceAll("-", "");
    const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();
    this.resets.create(token, user.id, expiresAt);
    return { token };
  }

  /** Complete a forgot-password flow using a one-time token. */
  async resetPassword(token: string, newPassword: string): Promise<AuthResult> {
    if (newPassword.length < MIN_PASSWORD)
      return {
        ok: false,
        error: `La contraseña debe tener al menos ${MIN_PASSWORD} caracteres.`,
      };
    const row = this.resets.findValid(token);
    if (!row) return { ok: false, error: "El enlace no es válido o ya expiró." };
    const passwordHash = await Bun.password.hash(newPassword);
    this.users.updatePassword(row.user_id, passwordHash);
    this.resets.markUsed(token);
    // Force re-login everywhere after a reset.
    this.sessions.deleteByUser(row.user_id);
    return { ok: true };
  }

  // --- Sessions --------------------------------------------------------

  createSession(userId: number): string {
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
