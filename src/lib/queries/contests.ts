import "server-only";
import { asc, count, desc, eq, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import {
  contestProblems,
  contests,
  participations,
  problemCells,
  students,
  type CellStatus,
  type ParticipationKind,
} from "@/db/schema";
import { getDefaultBatchId } from "@/lib/sync/runs";

/** Server-only reads for the Contests home and the Contest matrix (Section 8). */

export interface ContestStats {
  participants: number;
  live: number;
  virtual: number;
  practiceOnly: number;
  liveSolves: number;
  zeroLive: number;
  upsolved: number;
  fullySolved: number;
  /** problems participants did not solve live or virtually */
  upsolveBase: number;
}

const emptyStats: ContestStats = { participants: 0, live: 0, virtual: 0, practiceOnly: 0, liveSolves: 0, zeroLive: 0, upsolved: 0, fullySolved: 0, upsolveBase: 0 };

export interface ContestListItem {
  id: string;
  cfContestId: number;
  kind: "GROUP" | "GYM";
  groupCode: string | null;
  title: string;
  startsAt: Date | null;
  problemCount: number;
  accessMode: "AUTO" | "MANAGER" | "MEMBER";
  resolvedMode: "AUTO" | "MANAGER" | "MEMBER" | null;
  lastSyncedAt: Date | null;
  lastSyncError: string | null;
  stats: ContestStats;
}

async function statsByContest(): Promise<Map<string, ContestStats>> {
  const p = participations;
  const rows = await db
    .select({
      contestId: p.contestId,
      participants: count(),
      live: sql<number>`count(*) filter (where ${p.kind} = 'LIVE')`.mapWith(Number),
      virtual: sql<number>`count(*) filter (where ${p.kind} = 'VIRTUAL')`.mapWith(Number),
      practiceOnly: sql<number>`count(*) filter (where ${p.kind} = 'PRACTICE_ONLY')`.mapWith(Number),
      liveSolves: sql<number>`coalesce(sum(${p.solvedLive}) filter (where ${p.kind} = 'LIVE'), 0)`.mapWith(Number),
      zeroLive: sql<number>`count(*) filter (where ${p.kind} = 'LIVE' and ${p.solvedLive} = 0)`.mapWith(Number),
      upsolved: sql<number>`coalesce(sum(${p.upsolved}), 0)`.mapWith(Number),
      fullySolved: sql<number>`count(*) filter (where ${contests.problemCount} > 0 and ${p.solvedLive} + ${p.solvedVirtual} + ${p.upsolved} >= ${contests.problemCount})`.mapWith(Number),
      upsolveBase: sql<number>`coalesce(sum(${contests.problemCount} - ${p.solvedLive} - ${p.solvedVirtual}), 0)`.mapWith(Number),
    })
    .from(p)
    .innerJoin(contests, eq(contests.id, p.contestId))
    .groupBy(p.contestId);
  return new Map(rows.map(({ contestId, ...s }) => [contestId, s]));
}

export async function getRosterSize(batchId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(students).where(eq(students.batchId, batchId));
  return n;
}

export async function listContests(): Promise<{ rosterSize: number; contests: ContestListItem[] }> {
  const batchId = await getDefaultBatchId();
  const [rosterSize, rows, stats] = await Promise.all([
    getRosterSize(batchId),
    db
      .select({
        id: contests.id,
        cfContestId: contests.cfContestId,
        kind: contests.kind,
        groupCode: contests.groupCode,
        title: contests.title,
        startsAt: contests.startsAt,
        problemCount: contests.problemCount,
        accessMode: contests.accessMode,
        resolvedMode: contests.resolvedMode,
        lastSyncedAt: contests.lastSyncedAt,
        lastSyncError: contests.lastSyncError,
      })
      .from(contests)
      .where(eq(contests.batchId, batchId))
      .orderBy(sql`${contests.startsAt} desc nulls last`, desc(contests.createdAt)),
    statsByContest(),
  ]);
  return { rosterSize, contests: rows.map((c) => ({ ...c, stats: stats.get(c.id) ?? emptyStats })) };
}

// ---------------------------------------------------------------- matrix

export interface MatrixCell {
  status: CellStatus;
  rejectedAttempts: number;
  points: number | null;
  solvedAtSeconds: number | null;
}

export interface MatrixRow {
  studentId: string;
  niatId: string;
  name: string | null;
  college: string | null;
  phone: string;
  cfHandle: string;
  handleStatus: "UNVERIFIED" | "VALID" | "INVALID";
  participation: ParticipationKind | null;
  rank: number | null;
  solvedLive: number;
  solvedVirtual: number;
  upsolved: number;
  cells: Record<string, MatrixCell>;
}

export interface MatrixProblem {
  index: string;
  name: string;
  rating: number | null;
  maxPoints: number | null;
  solvedBy: number;
}

/** Memoised per request: the page and generateMetadata both call it. */
export const getContestMatrix = cache(async function getContestMatrix(id: string) {
  const [contest] = await db.select().from(contests).where(eq(contests.id, id));
  if (!contest) return null;

  const [problems, roster, parts, cells] = await Promise.all([
    db.select().from(contestProblems).where(eq(contestProblems.contestId, id)).orderBy(asc(contestProblems.sortOrder)),
    db
      .select({
        id: students.id,
        niatId: students.niatId,
        name: students.name,
        college: students.college,
        phone: students.phone,
        cfHandle: students.cfHandle,
        handleStatus: students.handleStatus,
      })
      .from(students)
      .where(eq(students.batchId, contest.batchId))
      .orderBy(asc(students.niatId)),
    db.select().from(participations).where(eq(participations.contestId, id)),
    db.select().from(problemCells).where(eq(problemCells.contestId, id)),
  ]);

  const partBy = new Map(parts.map((p) => [p.studentId, p]));
  const cellsBy = new Map<string, Record<string, MatrixCell>>();
  const solvedBy = new Map<string, number>();
  for (const c of cells) {
    const rec = cellsBy.get(c.studentId) ?? {};
    rec[c.problemIndex] = { status: c.status, rejectedAttempts: c.rejectedAttempts, points: c.points, solvedAtSeconds: c.solvedAtSeconds };
    cellsBy.set(c.studentId, rec);
    if (c.status !== "ATTEMPTED") solvedBy.set(c.problemIndex, (solvedBy.get(c.problemIndex) ?? 0) + 1);
  }

  const rows: MatrixRow[] = roster.map((s) => {
    const p = partBy.get(s.id);
    return {
      studentId: s.id,
      niatId: s.niatId,
      name: s.name,
      college: s.college,
      phone: s.phone,
      cfHandle: s.cfHandle,
      handleStatus: s.handleStatus,
      participation: p?.kind ?? null,
      rank: p?.rank ?? null,
      solvedLive: p?.solvedLive ?? 0,
      solvedVirtual: p?.solvedVirtual ?? 0,
      upsolved: p?.upsolved ?? 0,
      cells: cellsBy.get(s.id) ?? {},
    };
  });

  const n = problems.length;
  const live = rows.filter((r) => r.participation === "LIVE");
  const participants = rows.filter((r) => r.participation);
  const upsolveBase = participants.reduce((a, r) => a + (n - r.solvedLive - r.solvedVirtual), 0);
  const upsolvedTotal = participants.reduce((a, r) => a + r.upsolved, 0);

  const kpis = {
    students: rows.length,
    live: live.length,
    virtual: rows.filter((r) => r.participation === "VIRTUAL").length,
    practiceOnly: rows.filter((r) => r.participation === "PRACTICE_ONLY").length,
    absent: rows.filter((r) => !r.participation).length,
    avgSolvedLive: live.length ? live.reduce((a, r) => a + r.solvedLive, 0) / live.length : null,
    upsolveRate: upsolveBase > 0 ? upsolvedTotal / upsolveBase : null,
    fullySolved: n > 0 ? participants.filter((r) => r.solvedLive + r.solvedVirtual + r.upsolved >= n).length : 0,
    zeroSolved: live.filter((r) => r.solvedLive + r.solvedVirtual === 0).length,
    problemCount: n,
  };

  const matrixProblems: MatrixProblem[] = problems.map((p) => ({
    index: p.problemIndex,
    name: p.name,
    rating: p.rating,
    maxPoints: p.maxPoints,
    solvedBy: solvedBy.get(p.problemIndex) ?? 0,
  }));

  return { contest, problems: matrixProblems, rows, kpis };
});

export type ContestMatrix = NonNullable<Awaited<ReturnType<typeof getContestMatrix>>>;
