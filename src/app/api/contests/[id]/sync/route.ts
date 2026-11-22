import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { contests } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { syncContest } from "@/lib/sync/contest";
import { syncErrorResponse } from "@/lib/sync/respond";

const COOLDOWN_SECONDS = 30;
const uuid = z.uuid();

/**
 * POST /api/contests/[id]/sync -> 200 { syncedAt, participants, cells }
 * 429 { retryAfterSeconds } within 30 s of the last sync; 409 while another sync holds the lock.
 */
export async function POST(_request: Request, ctx: RouteContext<"/api/contests/[id]/sync">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Contest not found");

  const [contest] = await db.select({ lastSyncedAt: contests.lastSyncedAt }).from(contests).where(eq(contests.id, id));
  if (!contest) return jsonError(404, "NOT_FOUND", "Contest not found");

  const requestedAt = new Date();
  if (contest.lastSyncedAt) {
    const age = (requestedAt.getTime() - contest.lastSyncedAt.getTime()) / 1000;
    if (age < COOLDOWN_SECONDS) {
      const retryAfterSeconds = Math.ceil(COOLDOWN_SECONDS - age);
      return jsonError(429, "COOLDOWN", `Synced ${Math.floor(age)} s ago. Try again in ${retryAfterSeconds} s.`, {
        retryAfterSeconds,
        headers: { "Retry-After": String(retryAfterSeconds) },
      });
    }
  }

  try {
    // If another request synced this contest while we waited for the lock, don't repeat it (409).
    const r = await syncContest(id, { trigger: "MANUAL", triggeredBy: auth.adminId, skipIfSyncedAfter: requestedAt });
    return NextResponse.json({
      syncedAt: r.syncedAt,
      participants: r.participants,
      cells: r.cells,
      resolvedMode: r.resolvedMode,
      cfCalls: r.cfCalls,
    });
  } catch (err) {
    return syncErrorResponse(err);
  }
}
