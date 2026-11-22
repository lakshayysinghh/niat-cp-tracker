import { jwtVerify, SignJWT } from "jose";

/**
 * Session JWT (HS256, 7 days). No database or Next.js imports, so both
 * src/proxy.ts and src/lib/auth.ts can use it.
 */

export const SESSION_COOKIE = "cpd_session";
export const SESSION_MAX_AGE_SECONDS = 7 * 24 * 60 * 60;

export type Role = "admin" | "instructor";

export interface SessionClaims {
  adminId: string;
  role: Role;
}

function secretKey(): Uint8Array {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 64) {
    throw new Error("SESSION_SECRET must be set to 32+ random bytes in hex (openssl rand -hex 32)");
  }
  return new TextEncoder().encode(secret);
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  return new SignJWT({ role: claims.role })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.adminId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_SECONDS}s`)
    .sign(secretKey());
}

/** Returns the claims, or null for a missing, tampered or expired token. */
export async function readSessionToken(token: string | undefined): Promise<SessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
    const role = payload.role;
    if (typeof payload.sub !== "string" || (role !== "admin" && role !== "instructor")) return null;
    return { adminId: payload.sub, role };
  } catch {
    return null;
  }
}
