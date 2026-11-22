/**
 * Scheduled contest sync (IMPLEMENTATION_PLAN.md, Section 6 "Scheduled sync").
 * Run by .github/workflows/sync.yml every 3 hours, or by hand:
 *
 *   npm run sync              # discovery + contests from the last 21 days (+ never-synced ones)
 *   npm run sync -- --all     # every contest
 *   npm run sync -- --no-discover
 *
 * Uses the same syncContest() and database lock as the web app's Refresh button.
 */
import "./load-env";
import { and, asc, eq, gte, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { contests } from "@/db/schema";
import { CfError } from "@/lib/cf/client";
import { syncContest } from "@/lib/sync/contest";
import { discoverContests } from "@/lib/sync/discovery";
import { getDefaultBatchId } from "@/lib/sync/runs";

const RECENT_DAYS = 21;
const NIGHTLY_UTC_HOUR = 21; // the 21:47 UTC run (03:17 IST) syncs everything

function log(msg: string) {
  console.log(`[${new Date().toISOString().slice(11, 19)}Z] ${msg}`);
}

async function main() {
  const args = new Set(process.argv.slice(2));
  const nightly = new Date().getUTCHours() === NIGHTLY_UTC_HOUR;
  const all = args.has("--all") || nightly;
  const t0 = Date.now();
  log(`mode: ${all ? (args.has("--all") ? "all (--all)" : "all (nightly run)") : `last ${RECENT_DAYS} days + never synced`}`);

  // 1. Discovery
  if (!args.has("--no-discover")) {
    try {
      const d = await discoverContests({ trigger: "CRON", lockWaitMs: 90_000 });
      log(`discovery: ${d.groups} linked group(s), ${d.added.length} new contest(s)${d.added.length ? `: ${d.added.map((a) => `${a.cfContestId} "${a.title}"`).join(", ")}` : ""}`);
      for (const e of d.errors) log(`discovery error in ${e.groupCode}: ${e.error}`);
    } catch (err) {
      log(`discovery failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // 2. Pick contests
  const batchId = await getDefaultBatchId();
  const since = new Date(Date.now() - RECENT_DAYS * 24 * 3600 * 1000);
  const picked = await db
    .select({ id: contests.id, cfContestId: contests.cfContestId, title: contests.title })
    .from(contests)
    .where(
      all
        ? eq(contests.batchId, batchId)
        : and(eq(contests.batchId, batchId), or(gte(contests.startsAt, since), isNull(contests.startsAt), isNull(contests.lastSyncedAt))),
    )
    .orderBy(sql`${contests.lastSyncedAt} asc nulls first`, asc(contests.startsAt));
  log(`${picked.length} contest(s) to sync`);

  // 3. Sync one by one; a failure is recorded in sync_runs and the loop moves on.
  let ok = 0;
  const failures: Array<{ cfContestId: number; code: string; message: string }> = [];
  for (const c of picked) {
    try {
      const r = await syncContest(c.id, { trigger: "CRON", lockWaitMs: 90_000 });
      ok++;
      log(`ok   ${c.cfContestId} "${c.title}": ${r.participants} participants, ${r.cells} cells, ${r.cfCalls} call(s)`);
    } catch (err) {
      const code = err instanceof CfError ? err.code : err instanceof Error ? err.name : "ERROR";
      const message = err instanceof Error ? err.message : String(err);
      failures.push({ cfContestId: c.cfContestId, code, message });
      log(`FAIL ${c.cfContestId} "${c.title}": ${code}`);
    }
  }

  log(`done in ${((Date.now() - t0) / 1000).toFixed(1)} s: ${ok} synced, ${failures.length} failed`);

  // A contest the key cannot see (Manager box unticked) is expected and stays green.
  // Key/signature problems or Codeforces being unreachable for every contest turn the run red.
  const fatal = failures.filter((f) => f.code === "CF_AUTH" || f.code === "CF_SCHEMA");
  const allUnreachable = picked.length > 0 && failures.length === picked.length && failures.every((f) => f.code === "CF_UNREACHABLE" || f.code === "CF_RATE_LIMIT");
  if (fatal.length || allUnreachable) {
    console.error(fatal.length ? `Fatal: ${fatal[0].message}` : "Fatal: Codeforces was unreachable for every contest");
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error("Sync aborted:", err);
  process.exitCode = 1;
});
