import "server-only";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { contestProblems, contests, participations, problemCells, students, type ParticipationKind } from "@/db/schema";
import { getDefaultBatchId } from "@/lib/sync/runs";

/** Server-only reads for Students, Student detail and Batch overview (Section 8). */

export interface RosterRow {
  id: string;
  niatId: string;
  name: string | null;
  college: string | null;
  phone: string;
  enteredHandle: string;
  cfHandle: string;
  handleStatus: "UNVERIFIED" | "VALID" | "INVALID";
  cfRating: number | null;
  cfMaxRating: number | null;
  cfRank: string | null;
  cfLastOnlineAt: Date | null;
  liveAttended: number;
  contestsTracked: number;
  liveSolves: number;
  virtualSolves: number;
  upsolves: number;
}

async function syncedContests(batchId: string) {
  return db
    .select({
      id: contests.id,
      title: contests.title,
      kind: contests.kind,
      groupCode: contests.groupCode,
      cfContestId: contests.cfContestId,
      startsAt: contests.startsAt,
      problemCount: contests.problemCount,
    })
    .from(contests)
    .where(and(eq(contests.batchId, batchId), isNotNull(contests.lastSyncedAt)))
    .orderBy(sql`${contests.startsAt} desc nulls last`, sql`${contests.createdAt} desc`);
}

export async function listRoster(): Promise<{ rows: RosterRow[]; contestsTracked: number }> {
  const batchId = await getDefaultBatchId();
  const p = participations;
  const [roster, totals, tracked] = await Promise.all([
    db.select().from(students).where(eq(students.batchId, batchId)).orderBy(asc(students.niatId)),
    db
      .select({
        studentId: p.studentId,
        liveAttended: sql<number>`count(*) filter (where ${p.kind} = 'LIVE')`.mapWith(Number),
        liveSolves: sql<number>`coalesce(sum(${p.solvedLive}), 0)`.mapWith(Number),
        virtualSolves: sql<number>`coalesce(sum(${p.solvedVirtual}), 0)`.mapWith(Number),
        upsolves: sql<number>`coalesce(sum(${p.upsolved}), 0)`.mapWith(Number),
      })
      .from(p)
      .groupBy(p.studentId),
    syncedContests(batchId),
  ]);
  const by = new Map(totals.map((t) => [t.studentId, t]));
  const rows = roster.map((s) => {
    const t = by.get(s.id);
    return {
      id: s.id,
      niatId: s.niatId,
      name: s.name,
      college: s.college,
      phone: s.phone,
      enteredHandle: s.enteredHandle,
      cfHandle: s.cfHandle,
      handleStatus: s.handleStatus,
      cfRating: s.cfRating,
      cfMaxRating: s.cfMaxRating,
      cfRank: s.cfRank,
      cfLastOnlineAt: s.cfLastOnlineAt,
      liveAttended: t?.liveAttended ?? 0,
      contestsTracked: tracked.length,
      liveSolves: t?.liveSolves ?? 0,
      virtualSolves: t?.virtualSolves ?? 0,
      upsolves: t?.upsolves ?? 0,
    };
  });
  return { rows, contestsTracked: tracked.length };
}

// ---------------------------------------------------------------- student detail

export interface HistoryRow {
  contestId: string;
  title: string;
  kind: "GROUP" | "GYM";
  groupCode: string | null;
  cfContestId: number;
  startsAt: Date | null;
  problemCount: number;
  participation: ParticipationKind | null;
  rank: number | null;
  solvedLive: number;
  solvedVirtual: number;
  upsolved: number;
  unsolved: Array<{ index: string; name: string; rejected: number }>;
}

export async function getStudentDetail(niatId: string) {
  const [student] = await db.select().from(students).where(eq(students.niatId, niatId.toUpperCase()));
  if (!student) return null;

  const list = await syncedContests(student.batchId);
  const ids = list.map((c) => c.id);
  const [parts, cells, problems] = ids.length
    ? await Promise.all([
        db.select().from(participations).where(and(eq(participations.studentId, student.id), inArray(participations.contestId, ids))),
        db.select().from(problemCells).where(and(eq(problemCells.studentId, student.id), inArray(problemCells.contestId, ids))),
        db
          .select({ contestId: contestProblems.contestId, index: contestProblems.problemIndex, name: contestProblems.name })
          .from(contestProblems)
          .where(inArray(contestProblems.contestId, ids))
          .orderBy(asc(contestProblems.sortOrder)),
      ])
    : [[], [], []];

  const partBy = new Map(parts.map((p) => [p.contestId, p]));
  const history: HistoryRow[] = list.map((c) => {
    const p = partBy.get(c.id);
    const mine = cells.filter((x) => x.contestId === c.id);
    const solved = new Set(mine.filter((x) => x.status !== "ATTEMPTED").map((x) => x.problemIndex));
    const rejected = new Map(mine.map((x) => [x.problemIndex, x.rejectedAttempts]));
    return {
      contestId: c.id,
      title: c.title,
      kind: c.kind,
      groupCode: c.groupCode,
      cfContestId: c.cfContestId,
      startsAt: c.startsAt,
      problemCount: c.problemCount,
      participation: p?.kind ?? null,
      rank: p?.rank ?? null,
      solvedLive: p?.solvedLive ?? 0,
      solvedVirtual: p?.solvedVirtual ?? 0,
      upsolved: p?.upsolved ?? 0,
      unsolved: problems
        .filter((x) => x.contestId === c.id && !solved.has(x.index))
        .map((x) => ({ index: x.index, name: x.name, rejected: rejected.get(x.index) ?? 0 })),
    };
  });

  const attendedLive = history.filter((h) => h.participation === "LIVE");
  const participated = history.filter((h) => h.participation);
  const upsolveBase = participated.reduce((a, h) => a + h.problemCount - h.solvedLive - h.solvedVirtual, 0);
  const kpis = {
    contests: history.length,
    attendedLive: attendedLive.length,
    avgSolvedLive: attendedLive.length ? attendedLive.reduce((a, h) => a + h.solvedLive, 0) / attendedLive.length : null,
    liveSolves: history.reduce((a, h) => a + h.solvedLive, 0),
    virtualSolves: history.reduce((a, h) => a + h.solvedVirtual, 0),
    upsolves: history.reduce((a, h) => a + h.upsolved, 0),
    upsolveRate: upsolveBase > 0 ? participated.reduce((a, h) => a + h.upsolved, 0) / upsolveBase : null,
  };

  return { student, history, kpis };
}

// ---------------------------------------------------------------- overview

export type RiskReason = "MISSED_LAST_2" | "ZERO_LAST_2" | "HANDLE_INVALID" | "HANDLE_UNVERIFIED" | "NEVER_SEEN";

export const RISK_LABEL: Record<RiskReason, string> = {
  MISSED_LAST_2: "Missed the last 2 contests",
  ZERO_LAST_2: "Solved 0 in the last 2 contests attended",
  HANDLE_INVALID: "Handle not found on Codeforces",
  HANDLE_UNVERIFIED: "Handle not verified yet",
  NEVER_SEEN: "Never seen in any contest (may not have joined the group)",
};

export async function getOverview() {
  const batchId = await getDefaultBatchId();
  const [roster, list] = await Promise.all([
    db
      .select({
        id: students.id,
        niatId: students.niatId,
        name: students.name,
        phone: students.phone,
        cfHandle: students.cfHandle,
        handleStatus: students.handleStatus,
        college: students.college,
      })
      .from(students)
      .where(eq(students.batchId, batchId))
      .orderBy(asc(students.niatId)),
    syncedContests(batchId),
  ]);
  const ids = list.map((c) => c.id);
  const parts = ids.length ? await db.select().from(participations).where(inArray(participations.contestId, ids)) : [];

  // contestId -> studentId -> participation
  const byContest = new Map<string, Map<string, (typeof parts)[number]>>();
  for (const p of parts) {
    const m = byContest.get(p.contestId) ?? new Map();
    m.set(p.studentId, p);
    byContest.set(p.contestId, m);
  }

  const lastTwo = list.slice(0, 2);
  const atRisk: Array<{ student: (typeof roster)[number]; reasons: RiskReason[] }> = [];
  const leaderboard = roster.map((s) => {
    const mine = list.map((c) => byContest.get(c.id)?.get(s.id)).filter((p): p is NonNullable<typeof p> => Boolean(p));
    const live = mine.filter((p) => p.kind === "LIVE");
    const reasons: RiskReason[] = [];
    if (s.handleStatus === "INVALID") reasons.push("HANDLE_INVALID");
    if (s.handleStatus === "UNVERIFIED") reasons.push("HANDLE_UNVERIFIED");
    if (list.length > 0 && mine.length === 0) reasons.push("NEVER_SEEN");
    else {
      if (lastTwo.length === 2 && lastTwo.every((c) => byContest.get(c.id)?.get(s.id)?.kind !== "LIVE")) reasons.push("MISSED_LAST_2");
      if (live.length >= 2 && live.slice(0, 2).every((p) => p.solvedLive + p.solvedVirtual === 0)) reasons.push("ZERO_LAST_2");
    }
    if (reasons.length) atRisk.push({ student: s, reasons });
    return {
      student: s,
      liveAttended: live.length,
      liveSolves: mine.reduce((a, p) => a + p.solvedLive, 0),
      upsolves: mine.reduce((a, p) => a + p.upsolved, 0),
    };
  });
  leaderboard.sort((a, b) => b.liveSolves + b.upsolves - (a.liveSolves + a.upsolves) || b.liveSolves - a.liveSolves || b.liveAttended - a.liveAttended);

  const recent = list.slice(0, 10).map((c) => {
    const m = byContest.get(c.id) ?? new Map();
    const ps = [...m.values()];
    const live = ps.filter((p) => p.kind === "LIVE");
    const base = ps.reduce((a, p) => a + c.problemCount - p.solvedLive - p.solvedVirtual, 0);
    return {
      ...c,
      live: live.length,
      virtual: ps.filter((p) => p.kind === "VIRTUAL").length,
      absent: roster.length - ps.length,
      avgSolvedLive: live.length ? live.reduce((a, p) => a + p.solvedLive, 0) / live.length : null,
      upsolveRate: base > 0 ? ps.reduce((a, p) => a + p.upsolved, 0) / base : null,
    };
  });

  return { rosterSize: roster.length, contestsTracked: list.length, recent, atRisk, leaderboard };
}
