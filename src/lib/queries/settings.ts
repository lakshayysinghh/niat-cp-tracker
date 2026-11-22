import "server-only";
import { and, asc, desc, eq, gte, like } from "drizzle-orm";
import { db } from "@/db";
import { admins, contests, linkedGroups, syncRuns } from "@/db/schema";
import { getDefaultBatchId } from "@/lib/sync/runs";

/** Server-only reads for /settings (Section 8 "Settings"). */
export async function getSettings() {
  const batchId = await getDefaultBatchId();
  const [adminRows, groups, runs, [lastCron], [keyProblem]] = await Promise.all([
    db
      .select({ id: admins.id, email: admins.email, name: admins.name, role: admins.role, lastLoginAt: admins.lastLoginAt, createdAt: admins.createdAt })
      .from(admins)
      .orderBy(asc(admins.createdAt)),
    db.select().from(linkedGroups).where(eq(linkedGroups.batchId, batchId)).orderBy(asc(linkedGroups.createdAt)),
    db
      .select({
        id: syncRuns.id,
        kind: syncRuns.kind,
        trigger: syncRuns.trigger,
        startedAt: syncRuns.startedAt,
        finishedAt: syncRuns.finishedAt,
        ok: syncRuns.ok,
        cfCalls: syncRuns.cfCalls,
        error: syncRuns.error,
        contestTitle: contests.title,
        contestId: contests.id,
        by: admins.email,
      })
      .from(syncRuns)
      .leftJoin(contests, eq(contests.id, syncRuns.contestId))
      .leftJoin(admins, eq(admins.id, syncRuns.triggeredBy))
      .orderBy(desc(syncRuns.startedAt))
      .limit(50),
    db.select({ startedAt: syncRuns.startedAt }).from(syncRuns).where(eq(syncRuns.trigger, "CRON")).orderBy(desc(syncRuns.startedAt)).limit(1),
    // A key/signature failure in the last 24 h gets a banner (Section 4 "Errors and retries").
    db
      .select({ startedAt: syncRuns.startedAt, error: syncRuns.error })
      .from(syncRuns)
      .where(and(gte(syncRuns.startedAt, new Date(Date.now() - 24 * 3600 * 1000)), like(syncRuns.error, "%rejected the API key or signature%")))
      .orderBy(desc(syncRuns.startedAt))
      .limit(1),
  ]);
  return { admins: adminRows, groups, runs, lastCronAt: lastCron?.startedAt ?? null, keyProblem: keyProblem ?? null };
}

export type SettingsData = Awaited<ReturnType<typeof getSettings>>;
