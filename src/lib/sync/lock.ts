import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { syncLocks } from "@/db/schema";

/**
 * Database lease lock (IMPLEMENTATION_PLAN.md, Section 6 "Lock"): only one process
 * talks to Codeforces at a time (web app manual refresh vs GitHub Actions sync).
 */

export const LOCK_NAME = "codeforces";
export const LEASE_SECONDS = 120;

export class LockBusyError extends Error {
  readonly status = 409;
  readonly code = "SYNC_BUSY";
  constructor(message = "Another sync is running") {
    super(message);
    this.name = "LockBusyError";
  }
}

/** One attempt. Returns true when this holder now owns the lock. */
export async function tryAcquireLock(holder: string, leaseSeconds = LEASE_SECONDS): Promise<boolean> {
  const rows = await db
    .insert(syncLocks)
    .values({ name: LOCK_NAME, holder, expiresAt: sql`now() + make_interval(secs => ${leaseSeconds})` })
    .onConflictDoUpdate({
      target: syncLocks.name,
      set: { holder: sql`excluded.holder`, expiresAt: sql`excluded.expires_at` },
      setWhere: sql`${syncLocks.expiresAt} < now()`,
    })
    .returning({ holder: syncLocks.holder });
  return rows[0]?.holder === holder;
}

/** Extend the lease while still holding it (long verification loops). */
export async function renewLock(holder: string, leaseSeconds = LEASE_SECONDS): Promise<boolean> {
  const rows = await db
    .update(syncLocks)
    .set({ expiresAt: sql`now() + make_interval(secs => ${leaseSeconds})` })
    .where(and(eq(syncLocks.name, LOCK_NAME), eq(syncLocks.holder, holder)))
    .returning({ holder: syncLocks.holder });
  return rows.length === 1;
}

export async function releaseLock(holder: string): Promise<void> {
  await db.delete(syncLocks).where(and(eq(syncLocks.name, LOCK_NAME), eq(syncLocks.holder, holder)));
}

export interface LockOptions {
  /** How long to wait for the lock before LockBusyError (manual refresh: 20 s). */
  waitMs?: number;
  pollMs?: number;
}

export interface LockHandle {
  holder: string;
  renew: () => Promise<boolean>;
}

/** Acquire (waiting up to waitMs), run fn, always release. */
export async function withLock<T>(fn: (lock: LockHandle) => Promise<T>, opts: LockOptions = {}): Promise<T> {
  const waitMs = opts.waitMs ?? 20_000;
  const pollMs = opts.pollMs ?? 1_000;
  const holder = randomUUID();
  const deadline = Date.now() + waitMs;

  while (!(await tryAcquireLock(holder))) {
    if (Date.now() + pollMs > deadline) throw new LockBusyError();
    await new Promise((r) => setTimeout(r, pollMs));
  }
  try {
    return await fn({ holder, renew: () => renewLock(holder) });
  } finally {
    await releaseLock(holder).catch(() => undefined);
  }
}
