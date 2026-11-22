import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { contests } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { canonicalContestUrl, parseCfUrl } from "@/lib/cf/parse-url";
import { jsonError } from "@/lib/http";
import { syncContest } from "@/lib/sync/contest";
import { LockBusyError } from "@/lib/sync/lock";
import { isUniqueViolation } from "@/lib/sync/respond";
import { getDefaultBatchId } from "@/lib/sync/runs";

const body = z.object({
  url: z.string().max(500),
  accessMode: z.enum(["AUTO", "MANAGER", "MEMBER"]).optional(),
});

/**
 * POST /api/contests { url, accessMode? } -> 201 { contest, sync } after the first sync.
 * If Codeforces refuses, the contest is still saved with lastSyncError so it can be retried.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;

  const parsedBody = body.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return jsonError(400, "BAD_REQUEST", "Send { url, accessMode? }");

  const parsed = parseCfUrl(parsedBody.data.url);
  if (!parsed.ok) return jsonError(400, "INVALID_URL", parsed.error);
  if (parsed.value.kind === "GROUP_LINK") {
    return jsonError(
      400,
      "INVALID_URL",
      "That is a group link. Paste a contest link, for example https://codeforces.com/group/vP4zGe21UV/contest/734032",
    );
  }
  const { kind, cfContestId, groupCode } = parsed.value;
  const batchId = await getDefaultBatchId();

  const [existing] = await db
    .select({ id: contests.id })
    .from(contests)
    .where(and(eq(contests.batchId, batchId), eq(contests.cfContestId, cfContestId)));
  if (existing) {
    return jsonError(409, "ALREADY_TRACKED", `Contest ${cfContestId} is already tracked in this batch`, { details: { id: existing.id } });
  }

  let id: string;
  try {
    [{ id }] = await db
      .insert(contests)
      .values({
        batchId,
        cfContestId,
        kind,
        groupCode,
        sourceUrl: canonicalContestUrl(parsed.value),
        title: `Contest ${cfContestId}`,
        accessMode: parsedBody.data.accessMode ?? "AUTO",
        createdBy: auth.adminId,
      })
      .returning({ id: contests.id });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "ALREADY_TRACKED", `Contest ${cfContestId} is already tracked in this batch`);
    throw err;
  }

  let sync: { ok: true; participants: number; cells: number } | { ok: false; error: string };
  try {
    const r = await syncContest(id, { trigger: "ADD", triggeredBy: auth.adminId });
    sync = { ok: true, participants: r.participants, cells: r.cells };
  } catch (err) {
    sync = { ok: false, error: err instanceof Error ? err.message : String(err) };
    if (err instanceof LockBusyError) {
      await db
        .update(contests)
        .set({ lastSyncError: "Another sync was running; press Refresh to sync this contest" })
        .where(eq(contests.id, id));
    }
  }

  const [contest] = await db.select().from(contests).where(eq(contests.id, id));
  return NextResponse.json({ contest, sync }, { status: 201 });
}
