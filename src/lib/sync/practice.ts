import "server-only";
import { and, desc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { contests, practiceSyncState, ratingSnapshots, students, submissions } from "@/db/schema";
import { CfHandleNotFoundError, getCfClient } from "@/lib/cf/client";
import { cfUserRatingResult, cfUserStatusResult, type CfSubmission } from "@/lib/cf/schemas";
import { verifyHandles } from "./handles";
import { withLock } from "./lock";
import { finishRun, getDefaultBatchId, startRun, type RunContext } from "./runs";

/**
 * Daily practice sync (IMPLEMENTATION_PLAN.md, Phase 5 and Section 8 "Practice").
 *  1. user.info for the batch (via verifyHandles: renames handled, ratings refreshed)
 *     -> today's rating_snapshots row per student.
 *  2. user.rating only on a student's first run or when their rating changed, so the
 *     rating chart has real history from day one (one snapshot per official round).
 *  3. user.status per student: full history on the first run, then incremental -
 *     newest 100, stopping at practice_sync_state.lastSubmissionId.
 *  4. contest.status per tracked group contest: private-group submissions that
 *     user.status never returns (one call per contest).
 * Takes the Codeforces lock per chunk of students so a manual refresh can slip in.
 */

const PAGE = 100;
const STUDENTS_PER_LOCK = 10;
const INSERT_CHUNK = 500;

export interface PracticeResult {
  students: number;
  snapshots: number;
  ratingHistories: number;
  fullHistory: number;
  incremental: number;
  submissionsAdded: number;
  contestsScanned: number;
  contestSubmissionsAdded: number;
  cfCalls: number;
  errors: Array<{ handle: string; error: string }>;
}

/** YYYY-MM-DD in IST. */
export function istDate(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(d);
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function toRow(studentId: string, s: CfSubmission): typeof submissions.$inferInsert {
  return {
    cfSubmissionId: s.id,
    studentId,
    cfContestId: s.contestId ?? s.problem.contestId ?? null,
    problemIndex: s.problem.index,
    problemName: s.problem.name,
    problemRating: s.problem.rating ?? null,
    tags: s.problem.tags,
    verdict: s.verdict ?? null,
    participantType: s.author.participantType,
    submittedAt: new Date(s.creationTimeSeconds * 1000),
  };
}

export async function syncPractice(opts: RunContext & { studentIds?: string[]; lockWaitMs?: number }): Promise<PracticeResult> {
  const batchId = await getDefaultBatchId();
  const cf = getCfClient();
  const calls0 = cf.callCount();
  const lockWaitMs = opts.lockWaitMs ?? 90_000;
  const result: PracticeResult = { students: 0, snapshots: 0, ratingHistories: 0, fullHistory: 0, incremental: 0, submissionsAdded: 0, contestsScanned: 0, contestSubmissionsAdded: 0, cfCalls: 0, errors: [] };
  const runId = await startRun("PRACTICE", opts);

  try {
    const scope = and(eq(students.batchId, batchId), eq(students.handleStatus, "VALID"), opts.studentIds?.length ? inArray(students.id, opts.studentIds) : undefined);
    const ids = (await db.select({ id: students.id }).from(students).where(scope)).map((s) => s.id);

    // 1. Refresh ratings (and catch renames) with user.info, then snapshot today.
    if (ids.length) await withLock((lock) => verifyHandles(ids, { ...opts, renew: lock.renew }), { waitMs: lockWaitMs });
    const roster = await db
      .select({ id: students.id, cfHandle: students.cfHandle, cfRating: students.cfRating, cfMaxRating: students.cfMaxRating })
      .from(students)
      .where(scope);
    result.students = roster.length;
    const today = istDate();
    if (roster.length) {
      const prior = await db
        .selectDistinctOn([ratingSnapshots.studentId], { studentId: ratingSnapshots.studentId, rating: ratingSnapshots.rating })
        .from(ratingSnapshots)
        .where(inArray(ratingSnapshots.studentId, roster.map((s) => s.id)))
        .orderBy(ratingSnapshots.studentId, desc(ratingSnapshots.takenOn));
      const priorBy = new Map(prior.map((p) => [p.studentId, p.rating]));

      await db
        .insert(ratingSnapshots)
        .values(roster.map((s) => ({ studentId: s.id, takenOn: today, rating: s.cfRating, maxRating: s.cfMaxRating })))
        .onConflictDoUpdate({
          target: [ratingSnapshots.studentId, ratingSnapshots.takenOn],
          set: { rating: sql`excluded.rating`, maxRating: sql`excluded.max_rating` },
        });
      result.snapshots = roster.length;

      // 2. Official rating history, only for first runs or changed ratings.
      const needHistory = roster.filter((s) => !priorBy.has(s.id) || (priorBy.get(s.id) ?? null) !== (s.cfRating ?? null));
      for (const group of chunks(needHistory, STUDENTS_PER_LOCK)) {
        await withLock(
          async (lock) => {
            for (const s of group) {
              await lock.renew();
              try {
                const changes = await cf.call("user.rating", { handle: s.cfHandle }, cfUserRatingResult);
                if (changes.length) {
                  let max = 0;
                  const rows = changes.map((c) => {
                    max = Math.max(max, c.newRating);
                    return { studentId: s.id, takenOn: istDate(new Date(c.ratingUpdateTimeSeconds * 1000)), rating: c.newRating, maxRating: max };
                  });
                  // Several rounds on one day: keep the last one (rows are chronological).
                  const byDay = new Map(rows.map((r) => [r.takenOn, r]));
                  byDay.delete(today);
                  if (byDay.size) await db.insert(ratingSnapshots).values([...byDay.values()]).onConflictDoNothing();
                }
                result.ratingHistories++;
              } catch (err) {
                result.errors.push({ handle: s.cfHandle, error: `user.rating: ${err instanceof Error ? err.message : String(err)}` });
              }
            }
          },
          { waitMs: lockWaitMs },
        );
      }
    }

    // 3. Submissions: full history first time, then incremental.
    const states = roster.length
      ? await db.select().from(practiceSyncState).where(inArray(practiceSyncState.studentId, roster.map((s) => s.id)))
      : [];
    const stateBy = new Map(states.map((s) => [s.studentId, s]));

    for (const group of chunks(roster, STUDENTS_PER_LOCK)) {
      await withLock(
        async (lock) => {
          for (const s of group) {
            await lock.renew();
            const last = stateBy.get(s.id)?.lastSubmissionId ?? null;
            try {
              let fresh: CfSubmission[];
              if (last == null) {
                fresh = await cf.call("user.status", { handle: s.cfHandle }, cfUserStatusResult);
                result.fullHistory++;
              } else {
                fresh = [];
                for (let from = 1; ; from += PAGE) {
                  const page = await cf.call("user.status", { handle: s.cfHandle, from, count: PAGE }, cfUserStatusResult);
                  const newer = page.filter((x) => x.id > last);
                  fresh.push(...newer);
                  if (newer.length < page.length || page.length < PAGE) break;
                  await lock.renew();
                }
                result.incremental++;
              }

              const rows = fresh.map((x) => toRow(s.id, x));
              const maxId = fresh.reduce((m, x) => Math.max(m, x.id), last ?? 0) || null;
              const writes: BatchItem<"pg">[] = chunks(rows, INSERT_CHUNK).map((c) => db.insert(submissions).values(c).onConflictDoNothing());
              writes.push(
                db
                  .insert(practiceSyncState)
                  .values({ studentId: s.id, lastSubmissionId: maxId, lastSyncedAt: new Date() })
                  .onConflictDoUpdate({ target: practiceSyncState.studentId, set: { lastSubmissionId: maxId, lastSyncedAt: new Date() } }),
              );
              await db.batch(writes as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
              result.submissionsAdded += rows.length;
            } catch (err) {
              const msg = err instanceof CfHandleNotFoundError ? `handle not found (renamed?); re-verify handles` : err instanceof Error ? err.message : String(err);
              result.errors.push({ handle: s.cfHandle, error: `user.status: ${msg}` });
            }
          }
        },
        { waitMs: lockWaitMs },
      );
    }

    // 4. Group-contest submissions. user.status does not return submissions made inside a
    //    private group's mashups, so read each tracked contest with contest.status (manager
    //    mode when it resolved to manager) and keep the roster's submissions. Upsolves done
    //    in the group then count as practice too. Submission ids are unique: re-reads are no-ops.
    const tracked = await db
      .select({ cfContestId: contests.cfContestId, groupCode: contests.groupCode, resolvedMode: contests.resolvedMode })
      .from(contests)
      .where(and(eq(contests.batchId, batchId), isNotNull(contests.lastSyncedAt)));
    const idByHandle = new Map(roster.map((s) => [s.cfHandle.toLowerCase(), s.id]));
    for (const group of chunks(tracked, STUDENTS_PER_LOCK)) {
      await withLock(
        async (lock) => {
          for (const c of group) {
            await lock.renew();
            try {
              const subs = await cf.call(
                "contest.status",
                { contestId: c.cfContestId, asManager: c.resolvedMode === "MANAGER" || undefined },
                cfUserStatusResult,
                { groupCode: c.groupCode, contestId: c.cfContestId },
              );
              const rows = subs.flatMap((x) => {
                const id = idByHandle.get(x.author.members[0]?.handle.toLowerCase() ?? "");
                return id ? [toRow(id, x)] : [];
              });
              for (const part of chunks(rows, INSERT_CHUNK)) {
                const added = await db.insert(submissions).values(part).onConflictDoNothing().returning({ id: submissions.cfSubmissionId });
                result.contestSubmissionsAdded += added.length;
              }
              result.contestsScanned++;
            } catch (err) {
              result.errors.push({ handle: `contest ${c.cfContestId}`, error: `contest.status: ${err instanceof Error ? err.message : String(err)}` });
            }
          }
        },
        { waitMs: lockWaitMs },
      );
    }

    result.cfCalls = cf.callCount() - calls0;
    const note = `${result.students} students, ${result.submissionsAdded} new submissions (${result.fullHistory} full, ${result.incremental} incremental), ${result.contestSubmissionsAdded} from ${result.contestsScanned} group contests, ${result.ratingHistories} rating histories`;
    await finishRun(runId, result.errors.length === 0, result.cfCalls, result.errors.length ? `${note} | errors: ${result.errors.map((e) => `${e.handle}: ${e.error}`).join("; ")}` : note);
    return result;
  } catch (err) {
    result.cfCalls = cf.callCount() - calls0;
    await finishRun(runId, false, result.cfCalls, err instanceof Error ? err.message : String(err)).catch(() => undefined);
    throw err;
  }
}
