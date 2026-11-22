import "server-only";
import type { CellStatus, ParticipationKind } from "@/db/schema";
import type { CfContest, CfProblem, CfRanklistRow } from "@/lib/cf/schemas";

/**
 * Standings rows -> matrix cells + participations (IMPLEMENTATION_PLAN.md, Section 6
 * "Merge rules"). Pure: no database, no network.
 */

export interface MergeInput {
  contest: Pick<CfContest, "type" | "durationSeconds">;
  problems: readonly CfProblem[];
  rows: readonly CfRanklistRow[];
  /** lowercased current handle -> student id */
  studentIdByHandle: ReadonlyMap<string, string>;
}

export interface MergedCell {
  studentId: string;
  problemIndex: string;
  status: CellStatus;
  rejectedAttempts: number;
  /** IOI score (solved or partial); null on ICPC/CF contests */
  points: number | null;
  /** seconds from contest start; live or virtual solves only */
  solvedAtSeconds: number | null;
}

export interface MergedParticipation {
  studentId: string;
  kind: ParticipationKind;
  rank: number | null;
  points: number;
  penalty: number;
  solvedLive: number;
  solvedVirtual: number;
  upsolved: number;
}

export interface MergeOutput {
  cells: MergedCell[];
  participations: MergedParticipation[];
  /** handles present in the standings but not on the roster */
  unmatchedHandles: string[];
}

type RowKind = "LIVE" | "VIRTUAL" | "PRACTICE";

export function rowKind(participantType: CfRanklistRow["party"]["participantType"]): RowKind | null {
  switch (participantType) {
    case "CONTESTANT":
    case "OUT_OF_COMPETITION":
      return "LIVE";
    case "VIRTUAL":
      return "VIRTUAL";
    case "PRACTICE":
      return "PRACTICE";
    default:
      return null; // MANAGER rows are ignored
  }
}

interface Solve {
  rejected: number;
  time: number | null;
  points: number;
}

interface ProblemAcc {
  live?: Solve;
  virtual?: Solve;
  upsolved: boolean;
  totalRejected: number;
  bestPartial: number;
}

interface StudentAcc {
  liveRow?: CfRanklistRow;
  virtualRow?: CfRanklistRow;
  hasPractice: boolean;
  problems: Map<string, ProblemAcc>;
}

export function mergeStandings(input: MergeInput): MergeOutput {
  const { contest, problems, rows, studentIdByHandle } = input;
  const isIoi = contest.type === "IOI";
  const fullPoints = (i: number) => (isIoi ? problems[i]?.points : undefined);
  const isSolved = (i: number, points: number) => {
    const full = fullPoints(i);
    return full !== undefined ? points >= full : points > 0;
  };

  const students = new Map<string, StudentAcc>();
  const unmatched = new Map<string, string>(); // lowercased -> as first seen

  for (const row of rows) {
    const kind = rowKind(row.party.participantType);
    if (!kind || row.party.ghost) continue;
    const handle = row.party.members[0]?.handle;
    if (!handle) continue;
    const studentId = studentIdByHandle.get(handle.toLowerCase());
    if (!studentId) {
      if (!unmatched.has(handle.toLowerCase())) unmatched.set(handle.toLowerCase(), handle);
      continue;
    }

    let acc = students.get(studentId);
    if (!acc) students.set(studentId, (acc = { hasPractice: false, problems: new Map() }));
    if (kind === "LIVE") acc.liveRow ??= row;
    else if (kind === "VIRTUAL") acc.virtualRow ??= row;
    else acc.hasPractice = true;

    row.problemResults.forEach((pr, i) => {
      const index = problems[i]?.index;
      if (index === undefined) return;
      let p = acc.problems.get(index);
      if (!p) acc.problems.set(index, (p = { upsolved: false, totalRejected: 0, bestPartial: 0 }));
      p.totalRejected += pr.rejectedAttemptCount;

      if (!isSolved(i, pr.points)) {
        if (isIoi && pr.points > p.bestPartial) p.bestPartial = pr.points;
        return;
      }
      const solve: Solve = { rejected: pr.rejectedAttemptCount, time: pr.bestSubmissionTimeSeconds ?? null, points: pr.points };
      if (kind === "LIVE") {
        // Time check: a live-row solve after the contest ended is an upsolve.
        const inTime = solve.time === null || solve.time <= contest.durationSeconds;
        if (inTime) p.live ??= solve;
        else p.upsolved = true;
      } else if (kind === "VIRTUAL") {
        p.virtual ??= solve;
      } else {
        p.upsolved = true;
      }
    });
  }

  const cells: MergedCell[] = [];
  const participations: MergedParticipation[] = [];

  for (const [studentId, acc] of students) {
    let solvedLive = 0;
    let solvedVirtual = 0;
    let upsolved = 0;

    for (const { index } of problems) {
      const p = acc.problems.get(index);
      if (!p) continue;
      const base = { studentId, problemIndex: index };
      if (p.live) {
        cells.push({ ...base, status: "SOLVED_LIVE", rejectedAttempts: p.live.rejected, points: isIoi ? p.live.points : null, solvedAtSeconds: p.live.time });
        solvedLive++;
      } else if (p.virtual) {
        cells.push({ ...base, status: "SOLVED_VIRTUAL", rejectedAttempts: p.virtual.rejected, points: isIoi ? p.virtual.points : null, solvedAtSeconds: p.virtual.time });
        solvedVirtual++;
      } else if (p.upsolved) {
        cells.push({ ...base, status: "UPSOLVED", rejectedAttempts: p.totalRejected, points: null, solvedAtSeconds: null });
        upsolved++;
      } else if (p.totalRejected > 0 || p.bestPartial > 0) {
        cells.push({ ...base, status: "ATTEMPTED", rejectedAttempts: p.totalRejected, points: p.bestPartial > 0 ? p.bestPartial : null, solvedAtSeconds: null });
      }
    }

    const ranked = acc.liveRow ?? acc.virtualRow;
    participations.push({
      studentId,
      kind: acc.liveRow ? "LIVE" : acc.virtualRow ? "VIRTUAL" : "PRACTICE_ONLY",
      rank: ranked ? ranked.rank : null,
      points: ranked ? ranked.points : 0,
      penalty: ranked ? ranked.penalty : 0,
      solvedLive,
      solvedVirtual,
      upsolved,
    });
  }

  return { cells, participations, unmatchedHandles: [...unmatched.values()] };
}
