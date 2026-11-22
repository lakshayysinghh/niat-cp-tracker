import "server-only";
import { and, eq, ne } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { contestProblems, contests, participations, problemCells, students, type Contest } from "@/db/schema";
import {
  CfContestAccessError,
  CfFailedError,
  CfHandleNotFoundError,
  getCfClient,
  type CfErrorContext,
} from "@/lib/cf/client";
import { cfContestListResult, cfStandingsResult, type CfStandings } from "@/lib/cf/schemas";
import { CHUNK, verifyHandles } from "./handles";
import { LockBusyError, withLock, type LockHandle } from "./lock";
import { mergeStandings } from "./merge";
import { finishRun, finishRunQuery, startRun, type RunContext } from "./runs";

/**
 * syncContest(contestId) (IMPLEMENTATION_PLAN.md, Section 6). Fetch standings for the
 * batch's VALID handles, merge, and replace the contest's snapshot in ONE db.batch.
 * On error the old snapshot stays and lastSyncError is saved.
 */

export const MAX_ROWS_PER_INSERT = 1000;

export interface SyncOptions extends RunContext {
  /** Lock wait (manual refresh: 20 s). */
  lockWaitMs?: number;
  /** If the contest was synced after this instant (while we waited), skip with 409. */
  skipIfSyncedAfter?: Date;
}

export interface SyncResult {
  syncedAt: Date;
  participants: number;
  cells: number;
  resolvedMode: "MANAGER" | "MEMBER";
  unmatchedHandles: string[];
  cfCalls: number;
}

export class ContestNotFoundError extends Error {
  readonly status = 404;
  constructor() {
    super("Contest not found");
  }
}

function chunks<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** True when a FAILED response means "this access mode is not allowed" (try the other one). */
function isAccessRefusal(err: unknown) {
  return err instanceof CfContestAccessError || err instanceof CfFailedError;
}

async function fetchStandings(contest: Contest, handles: readonly string[], lock: LockHandle) {
  const cf = getCfClient();
  const ctx: CfErrorContext = { groupCode: contest.groupCode, contestId: contest.cfContestId, keyHandle: process.env.CF_KEY_HANDLE };

  const fetchAll = async (asManager: boolean): Promise<CfStandings> => {
    const base = { contestId: contest.cfContestId, showUnofficial: true, asManager: asManager || undefined };
    if (handles.length === 0) {
      // Metadata and problems only.
      const s = await cf.call("contest.standings", { ...base, from: 1, count: 1 }, cfStandingsResult, ctx);
      return { ...s, rows: [] };
    }
    let first: CfStandings | undefined;
    const rows: CfStandings["rows"] = [];
    for (const part of chunks(handles, CHUNK)) {
      await lock.renew();
      const s = await cf.call("contest.standings", { ...base, handles: part.join(";") }, cfStandingsResult, ctx);
      first ??= s;
      rows.push(...s.rows);
    }
    return { contest: first!.contest, problems: first!.problems, rows };
  };

  const mode = contest.accessMode;
  if (mode === "MANAGER") return { standings: await fetchAll(true), resolvedMode: "MANAGER" as const };
  if (mode === "MEMBER") return { standings: await fetchAll(false), resolvedMode: "MEMBER" as const };

  // AUTO: try the remembered mode first (manager by default), then the other one once.
  const order: Array<"MANAGER" | "MEMBER"> = contest.resolvedMode === "MEMBER" ? ["MEMBER", "MANAGER"] : ["MANAGER", "MEMBER"];
  try {
    return { standings: await fetchAll(order[0] === "MANAGER"), resolvedMode: order[0] };
  } catch (err) {
    if (!isAccessRefusal(err)) throw err;
    return { standings: await fetchAll(order[1] === "MANAGER"), resolvedMode: order[1] };
  }
}

/** Title, start and duration from contest.list?gym=true&groupCode=… (works without contest access). */
async function fillFromGroupList(contest: Contest) {
  const list = await getCfClient().call("contest.list", { gym: true, groupCode: contest.groupCode }, cfContestListResult);
  const c = list.find((x) => x.id === contest.cfContestId);
  if (!c) return;
  await db
    .update(contests)
    .set({
      title: c.name,
      scoringType: c.type,
      phase: c.phase,
      startsAt: c.startTimeSeconds ? new Date(c.startTimeSeconds * 1000) : null,
      durationSeconds: c.durationSeconds,
    })
    .where(eq(contests.id, contest.id));
}

async function loadRoster(batchId: string) {
  return db
    .select({ id: students.id, cfHandle: students.cfHandle, handleLower: students.handleLower, handleStatus: students.handleStatus })
    .from(students)
    .where(and(eq(students.batchId, batchId), ne(students.handleStatus, "INVALID")));
}

export async function syncContest(contestId: string, opts: SyncOptions): Promise<SyncResult> {
  return withLock(
    async (lock) => {
      const [contest] = await db.select().from(contests).where(eq(contests.id, contestId));
      if (!contest) throw new ContestNotFoundError();
      if (opts.skipIfSyncedAfter && contest.lastSyncedAt && contest.lastSyncedAt > opts.skipIfSyncedAfter) {
        throw new LockBusyError("Another sync just refreshed this contest");
      }

      const cf = getCfClient();
      const calls0 = cf.callCount();
      const runId = await startRun("CONTEST", opts, contest.id);

      try {
        // 2. Verify UNVERIFIED handles first; only VALID handles go to Codeforces.
        let roster = await loadRoster(contest.batchId);
        const unverified = roster.filter((s) => s.handleStatus === "UNVERIFIED").map((s) => s.id);
        if (unverified.length) {
          await verifyHandles(unverified, { ...opts, renew: lock.renew });
          roster = await loadRoster(contest.batchId);
        }

        // 3–4. Fetch + validate. A not-found handle means a mid-week rename: re-verify, retry once.
        let valid = roster.filter((s) => s.handleStatus === "VALID");
        let fetched: Awaited<ReturnType<typeof fetchStandings>>;
        try {
          fetched = await fetchStandings(contest, valid.map((s) => s.cfHandle), lock);
        } catch (err) {
          if (!(err instanceof CfHandleNotFoundError)) throw err;
          await verifyHandles(valid.map((s) => s.id), { ...opts, renew: lock.renew });
          valid = (await loadRoster(contest.batchId)).filter((s) => s.handleStatus === "VALID");
          fetched = await fetchStandings(contest, valid.map((s) => s.cfHandle), lock);
        }
        const { standings, resolvedMode } = fetched;

        // 5. Merge (pure).
        const merged = mergeStandings({
          contest: standings.contest,
          problems: standings.problems,
          rows: standings.rows,
          studentIdByHandle: new Map(valid.map((s) => [s.handleLower, s.id])),
        });

        // 6. Replace the snapshot atomically.
        const now = new Date();
        const isIoi = standings.contest.type === "IOI";
        const cfCalls = cf.callCount() - calls0;
        const warning = merged.unmatchedHandles.length
          ? `warning: ${merged.unmatchedHandles.length} standings row(s) did not match the roster: ${merged.unmatchedHandles.join(", ")}`
          : null;

        const problemRows = standings.problems.map((p, i) => ({
          contestId: contest.id,
          problemIndex: p.index,
          name: p.name,
          maxPoints: isIoi ? (p.points ?? null) : null,
          rating: p.rating ?? null,
          tags: p.tags,
          sortOrder: i,
        }));
        const cellRows = merged.cells.map((c) => ({ contestId: contest.id, ...c }));
        const partRows = merged.participations.map((p) => ({ contestId: contest.id, ...p }));

        const statements: BatchItem<"pg">[] = [
          db.delete(problemCells).where(eq(problemCells.contestId, contest.id)),
          db.delete(participations).where(eq(participations.contestId, contest.id)),
          db.delete(contestProblems).where(eq(contestProblems.contestId, contest.id)),
          ...chunks(problemRows, MAX_ROWS_PER_INSERT).map((c) => db.insert(contestProblems).values(c)),
          ...chunks(cellRows, MAX_ROWS_PER_INSERT).map((c) => db.insert(problemCells).values(c)),
          ...chunks(partRows, MAX_ROWS_PER_INSERT).map((c) => db.insert(participations).values(c)),
          db
            .update(contests)
            .set({
              title: standings.contest.name,
              scoringType: standings.contest.type,
              phase: standings.contest.phase,
              startsAt: standings.contest.startTimeSeconds ? new Date(standings.contest.startTimeSeconds * 1000) : null,
              durationSeconds: standings.contest.durationSeconds,
              problemCount: standings.problems.length,
              resolvedMode,
              lastSyncedAt: now,
              lastSyncError: null,
            })
            .where(eq(contests.id, contest.id)),
          finishRunQuery(runId, true, cfCalls, warning),
        ];
        await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

        return {
          syncedAt: now,
          participants: merged.participations.length,
          cells: merged.cells.length,
          resolvedMode,
          unmatchedHandles: merged.unmatchedHandles,
          cfCalls,
        };
      } catch (err) {
        // 7. Keep the old snapshot; record the error on the contest and the run.
        const message = err instanceof Error ? err.message : String(err);
        await db.update(contests).set({ lastSyncError: message.slice(0, 2000) }).where(eq(contests.id, contest.id)).catch(() => undefined);
        // A contest the API cannot open yet still has a name and date in the group's contest list.
        if (err instanceof CfContestAccessError && contest.groupCode && contest.title === `Contest ${contest.cfContestId}`) {
          await fillFromGroupList(contest).catch(() => undefined);
        }
        await finishRun(runId, false, cf.callCount() - calls0, message).catch(() => undefined);
        throw err;
      }
    },
    { waitMs: opts.lockWaitMs ?? 20_000 },
  );
}
