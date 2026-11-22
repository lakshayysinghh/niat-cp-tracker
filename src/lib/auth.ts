import "server-only";
import bcrypt from "bcryptjs";
import { eq, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { cache } from "react";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { jsonError } from "@/lib/http";
import {
  readSessionToken,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  signSessionToken,
  type Role,
} from "@/lib/session-token";

/**
 * Auth boundary (IMPLEMENTATION_PLAN.md, Section 3, rule 1):
 * src/proxy.ts only redirects signed-out users. The real check is verifySession()
 * at the top of every protected Server Component / Server Action, and
 * requireApiSession() at the top of every Route Handler (401 / 403).
 */

export type { Role };

export interface Session {
  adminId: string;
  email: string;
  name: string;
  role: Role;
}

export const MAX_FAILED_LOGINS = 5;
export const LOCK_MINUTES = 15;
const BCRYPT_COST = 12;

// ---------------------------------------------------------------- cookie

export async function createSession(admin: { id: string; role: Role }): Promise<void> {
  const token = await signSessionToken({ adminId: admin.id, role: admin.role });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
}

export async function clearSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}

// ---------------------------------------------------------------- session reads

/**
 * Verified token + the admin row still exists. Role comes from the database, so a
 * role change or a deleted admin takes effect immediately. Memoised per request.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const claims = await readSessionToken((await cookies()).get(SESSION_COOKIE)?.value);
  if (!claims) return null;
  const [row] = await db
    .select({ id: admins.id, email: admins.email, name: admins.name, role: admins.role })
    .from(admins)
    .where(eq(admins.id, claims.adminId));
  if (!row) return null;
  return { adminId: row.id, email: row.email, name: row.name, role: row.role };
});

/** For Server Components and Server Actions: redirects to /login when signed out. */
export async function verifySession(): Promise<Session> {
  const session = await getSession();
  if (!session) redirect("/login");
  return session;
}

export class ForbiddenError extends Error {
  readonly status = 403;
  constructor(message = "You do not have permission to do this") {
    super(message);
    this.name = "ForbiddenError";
  }
}

export function hasRole(session: Session, role: Role): boolean {
  // "admin" can do everything; "instructor" (future) only what is explicitly allowed.
  return session.role === "admin" || session.role === role;
}

/** Throws ForbiddenError (403) unless the session has the role. */
export function requireRole(session: Session, role: Role): void {
  if (!hasRole(session, role)) throw new ForbiddenError();
}

/**
 * For Route Handlers. Returns the session, or a ready 401/403 response:
 *   const auth = await requireApiSession("admin");
 *   if (auth instanceof Response) return auth;
 */
export async function requireApiSession(role?: Role): Promise<Session | NextResponse> {
  const session = await getSession();
  if (!session) return jsonError(401, "UNAUTHENTICATED", "Sign in to continue");
  if (role && !hasRole(session, role)) return jsonError(403, "FORBIDDEN", "You do not have permission to do this");
  return session;
}

// ---------------------------------------------------------------- login

export type LoginResult =
  | { ok: true; admin: Session }
  | { ok: false; reason: "INVALID" }
  | { ok: false; reason: "LOCKED"; retryAfterSeconds: number };

let dummyHash: Promise<string> | undefined;
/** Compare against a throwaway hash for unknown emails so response time doesn't reveal them. */
const getDummyHash = () => (dummyHash ??= bcrypt.hash("not-a-real-password-0000", BCRYPT_COST));

export async function attemptLogin(emailInput: string, password: string): Promise<LoginResult> {
  const email = emailInput.trim().toLowerCase();
  const [admin] = await db.select().from(admins).where(eq(admins.email, email));

  if (!admin) {
    await bcrypt.compare(password, await getDummyHash());
    return { ok: false, reason: "INVALID" };
  }

  if (admin.lockedUntil && admin.lockedUntil.getTime() > Date.now()) {
    return { ok: false, reason: "LOCKED", retryAfterSeconds: Math.ceil((admin.lockedUntil.getTime() - Date.now()) / 1000) };
  }

  if (!(await bcrypt.compare(password, admin.passwordHash))) {
    // Atomic: the 5th failure locks the account for 15 minutes and resets the counter.
    // Both CASE expressions read the pre-update failed_logins value.
    await db
      .update(admins)
      .set({
        failedLogins: sql`CASE WHEN ${admins.failedLogins} + 1 >= ${MAX_FAILED_LOGINS} THEN 0 ELSE ${admins.failedLogins} + 1 END`,
        lockedUntil: sql`CASE WHEN ${admins.failedLogins} + 1 >= ${MAX_FAILED_LOGINS} THEN now() + make_interval(mins => ${LOCK_MINUTES}) ELSE ${admins.lockedUntil} END`,
      })
      .where(eq(admins.id, admin.id));
    return { ok: false, reason: "INVALID" };
  }

  await db
    .update(admins)
    .set({ failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));

  return { ok: true, admin: { adminId: admin.id, email: admin.email, name: admin.name, role: admin.role } };
}
