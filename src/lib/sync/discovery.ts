import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { contests, linkedGroups } from "@/db/schema";
import { getCfClient } from "@/lib/cf/client";
import { canonicalContestUrl } from "@/lib/cf/parse-url";
import { cfContestListResult } from "@/lib/cf/schemas";
import { withLock } from "./lock";
import { finishRun, getDefaultBatchId, startRun, type RunContext } from "./runs";

/**
 * Linked-group discovery (IMPLEMENTATION_PLAN.md, Section 6, step 1): for each linked
 * group with auto-discover on, call contest.list?gym=true&groupCode=… and add contests
 * this batch does not track yet. New contests are NOT synced here; the caller syncs them.
 */

export interface DiscoveryResult {
  groups: number;
  added: Array<{ cfContestId: number; title: string; groupCode: string }>;
  errors: Array<{ groupCode: string; error: string }>;
}

export async function discoverContests(ctx: RunContext & { groupCode?: string; lockWaitMs?: number }): Promise<DiscoveryResult> {
  const batchId = await getDefaultBatchId();
  const groups = await db
    .select({ groupCode: linkedGroups.groupCode })
    .from(linkedGroups)
    .where(
      ctx.groupCode
        ? and(eq(linkedGroups.batchId, batchId), eq(linkedGroups.groupCode, ctx.groupCode))
        : and(eq(linkedGroups.batchId, batchId), eq(linkedGroups.autoDiscover, true)),
    );
  const result: DiscoveryResult = { groups: groups.length, added: [], errors: [] };
  if (groups.length === 0) return result;

  return withLock(
    async (lock) => {
      const cf = getCfClient();
      const calls0 = cf.callCount();
      const runId = await startRun("DISCOVERY", ctx);

      for (const { groupCode } of groups) {
        try {
          await lock.renew();
          const list = await cf.call("contest.list", { gym: true, groupCode }, cfContestListResult, { groupCode });
          const ids = list.map((c) => c.id);
          const tracked = ids.length
            ? new Set(
                (
                  await db
                    .select({ id: contests.cfContestId })
                    .from(contests)
                    .where(and(eq(contests.batchId, batchId), inArray(contests.cfContestId, ids)))
                ).map((r) => r.id),
              )
            : new Set<number>();

          const fresh = list.filter((c) => !tracked.has(c.id));
          if (fresh.length) {
            const inserted = await db
              .insert(contests)
              .values(
                fresh.map((c) => ({
                  batchId,
                  cfContestId: c.id,
                  kind: "GROUP" as const,
                  groupCode,
                  sourceUrl: canonicalContestUrl({ kind: "GROUP", cfContestId: c.id, groupCode }),
                  title: c.name,
                  scoringType: c.type,
                  phase: c.phase,
                  startsAt: c.startTimeSeconds ? new Date(c.startTimeSeconds * 1000) : null,
                  durationSeconds: c.durationSeconds,
                  createdBy: ctx.triggeredBy ?? null,
                })),
              )
              .onConflictDoNothing()
              .returning({ cfContestId: contests.cfContestId, title: contests.title });
            result.added.push(...inserted.map((r) => ({ ...r, groupCode })));
          }
          await db
            .update(linkedGroups)
            .set({ lastDiscoveredAt: new Date() })
            .where(and(eq(linkedGroups.batchId, batchId), eq(linkedGroups.groupCode, groupCode)));
        } catch (err) {
          result.errors.push({ groupCode, error: err instanceof Error ? err.message : String(err) });
        }
      }

      const summary = result.added.length ? `added ${result.added.map((a) => a.cfContestId).join(", ")}` : null;
      const errors = result.errors.map((e) => `${e.groupCode}: ${e.error}`).join("; ");
      await finishRun(runId, result.errors.length === 0, cf.callCount() - calls0, [summary, errors].filter(Boolean).join(" | ") || null);
      return result;
    },
    { waitMs: ctx.lockWaitMs ?? 20_000 },
  );
}
