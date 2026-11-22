import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cfStandingsResult, type CfProblem, type CfRanklistRow } from "@/lib/cf/schemas";
import { mergeStandings, type MergeOutput } from "@/lib/sync/merge";

function loadStandings(file: string) {
  const fx = JSON.parse(readFileSync(path.join(__dirname, "fixtures", file), "utf8"));
  if (fx.response.status !== "OK") throw new Error(`${file} is not an OK response`);
  return cfStandingsResult.parse(fx.response.result);
}

/** Compact cell code: L/V/U/A + rejected attempts, e.g. "L1" = solved live after 1 wrong try. */
function code(out: MergeOutput, studentId: string, index: string): string {
  const c = out.cells.find((x) => x.studentId === studentId && x.problemIndex === index);
  if (!c) return "·";
  return { SOLVED_LIVE: "L", SOLVED_VIRTUAL: "V", UPSOLVED: "U", ATTEMPTED: "A" }[c.status] + c.rejectedAttempts;
}

// IMPLEMENTATION_PLAN.md, "Expected results for contest 734032"
const EXPECTED: Array<[handle: string, kind: string, rank: number | null, A: string, B: string, C: string, D: string]> = [
  ["usecarelessly18", "LIVE", 1, "L1", "L2", "L1", "A1"],
  ["priya.m.reddy2006", "LIVE", 2, "L1", "L0", "·", "·"],
  ["NotMyBug", "LIVE", 3, "L0", "·", "·", "·"],
  ["Y_ABHILASH_REDDY_2710", "LIVE", 4, "L2", "A5", "A1", "·"],
  ["Sattunashedixd14", "LIVE", 5, "L0", "·", "·", "·"],
  ["gorugantisathish", "LIVE", 6, "U1", "L0", "·", "·"],
  ["abhinavsosa23", "LIVE", 7, "L1", "·", "·", "·"],
  ["ashrithadontha1407", "LIVE", 8, "L1", "·", "·", "·"],
  ["sheelamsai5333", "LIVE", 9, "L1", "·", "·", "·"],
  ["katakamnitheesh613", "LIVE", 10, "L2", "·", "·", "A1"],
  ["saikumar121", "LIVE", 11, "L4", "·", "·", "·"],
  ["sailokeshdivvela", "PRACTICE_ONLY", null, "U1", "·", "·", "·"],
];

describe("mergeStandings: contest 734032 against the plan's expected-results table", () => {
  const s = loadStandings("standings-734032-roster.json");
  // Roster = the 12 participants plus two students who never showed up.
  const handles = [...EXPECTED.map((e) => e[0]), "absent_student_1", "zz_fake_handle_test"];
  const idByHandle = new Map(handles.map((h, i) => [h.toLowerCase(), `s${i + 1}`]));
  const id = (h: string) => idByHandle.get(h.toLowerCase())!;
  const out = mergeStandings({ contest: s.contest, problems: s.problems, rows: s.rows, studentIdByHandle: idByHandle });

  it("problems are A–F, ICPC, 2 hours", () => {
    expect(s.problems.map((p) => p.index)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(s.contest.type).toBe("ICPC");
    expect(s.contest.durationSeconds).toBe(7200);
  });

  it.each(EXPECTED)("%s: %s rank %s | A %s B %s C %s D %s", (handle, kind, rank, A, B, C, D) => {
    const p = out.participations.find((x) => x.studentId === id(handle));
    expect(p?.kind).toBe(kind);
    expect(p?.rank).toBe(rank);
    expect(["A", "B", "C", "D", "E", "F"].map((i) => code(out, id(handle), i))).toEqual([A, B, C, D, "·", "·"]);
  });

  it("solve times come from the live row only", () => {
    const c = out.cells.find((x) => x.studentId === id("usecarelessly18") && x.problemIndex === "A");
    expect(c?.solvedAtSeconds).toBe(1957);
    const up = out.cells.find((x) => x.studentId === id("gorugantisathish") && x.problemIndex === "A");
    expect(up).toMatchObject({ status: "UPSOLVED", solvedAtSeconds: null, points: null });
  });

  it("participation uses the live row's rank, points and penalty, never the practice row's", () => {
    expect(out.participations.find((x) => x.studentId === id("gorugantisathish"))).toMatchObject({ rank: 6, points: 1, penalty: 71, solvedLive: 1, upsolved: 1 });
    expect(out.participations.find((x) => x.studentId === id("sailokeshdivvela"))).toMatchObject({ rank: null, points: 0, penalty: 0, solvedLive: 0, upsolved: 1 });
  });

  it("totals: 12 participants (11 live, 1 practice only), 14 live solves, 2 upsolves, 0 zero-solvers", () => {
    expect(out.participations).toHaveLength(12);
    expect(out.participations.filter((p) => p.kind === "LIVE")).toHaveLength(11);
    expect(out.participations.filter((p) => p.kind === "PRACTICE_ONLY")).toHaveLength(1);
    const live = out.participations.filter((p) => p.kind === "LIVE");
    expect(live.reduce((a, p) => a + p.solvedLive, 0)).toBe(14);
    expect(out.cells.filter((c) => c.status === "UPSOLVED")).toHaveLength(2);
    expect(live.filter((p) => p.solvedLive + p.solvedVirtual === 0)).toHaveLength(0);
  });

  it("solved-by counts per problem: A 12, B 3, C 1, D 0, E 0, F 0", () => {
    const solved = (i: string) => out.cells.filter((c) => c.problemIndex === i && c.status !== "ATTEMPTED").length;
    expect(["A", "B", "C", "D", "E", "F"].map(solved)).toEqual([12, 3, 1, 0, 0, 0]);
  });

  it("absent students get no participation and no cells; nothing is unmatched", () => {
    for (const h of ["absent_student_1", "zz_fake_handle_test"]) {
      expect(out.participations.some((p) => p.studentId === id(h))).toBe(false);
      expect(out.cells.some((c) => c.studentId === id(h))).toBe(false);
    }
    expect(out.unmatchedHandles).toEqual([]);
  });

  it("the Phase 0 two-handle fixture merges the same way", () => {
    const two = loadStandings("standings-734032-manager.json");
    const o = mergeStandings({ contest: two.contest, problems: two.problems, rows: two.rows, studentIdByHandle: idByHandle });
    expect(["A", "B", "C", "D"].map((i) => code(o, id("usecarelessly18"), i))).toEqual(["L1", "L2", "L1", "A1"]);
    expect(["A", "B"].map((i) => code(o, id("gorugantisathish"), i))).toEqual(["U1", "L0"]);
  });
});

// ---------------------------------------------------------------- hand-made cases

const P = (index: string, points?: number): CfProblem => ({ index, name: `Problem ${index}`, type: "PROGRAMMING", points, tags: [] });
const R = (points: number, rejected: number, time?: number) => ({ points, rejectedAttemptCount: rejected, type: "FINAL" as const, bestSubmissionTimeSeconds: time });
function row(handle: string, participantType: CfRanklistRow["party"]["participantType"], results: ReturnType<typeof R>[], rank = 0): CfRanklistRow {
  return {
    party: { members: [{ handle }], participantType, ghost: false },
    rank,
    points: results.reduce((a, r) => a + r.points, 0),
    penalty: 0,
    successfulHackCount: 0,
    unsuccessfulHackCount: 0,
    problemResults: results,
  };
}
const ICPC = { type: "ICPC" as const, durationSeconds: 7200 };
const ids = new Map([["alice", "a"], ["bob", "b"], ["carol", "c"], ["dave", "d"], ["erin", "e"]]);

describe("mergeStandings: hand-made cases", () => {
  it("live solve", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A")], rows: [row("Alice", "CONTESTANT", [R(1, 2, 600)], 1)], studentIdByHandle: ids });
    expect(o.cells).toEqual([{ studentId: "a", problemIndex: "A", status: "SOLVED_LIVE", rejectedAttempts: 2, points: null, solvedAtSeconds: 600 }]);
    expect(o.participations[0]).toMatchObject({ kind: "LIVE", rank: 1, solvedLive: 1 });
  });

  it("out-of-competition counts as live", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A")], rows: [row("alice", "OUT_OF_COMPETITION", [R(1, 0, 60)], 3)], studentIdByHandle: ids });
    expect(o.cells[0].status).toBe("SOLVED_LIVE");
    expect(o.participations[0].kind).toBe("LIVE");
  });

  it("virtual solve", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A"), P("B")], rows: [row("bob", "VIRTUAL", [R(1, 1, 900), R(0, 3)], 4)], studentIdByHandle: ids });
    expect(o.cells.map((c) => [c.problemIndex, c.status, c.rejectedAttempts, c.solvedAtSeconds])).toEqual([
      ["A", "SOLVED_VIRTUAL", 1, 900],
      ["B", "ATTEMPTED", 3, null],
    ]);
    expect(o.participations[0]).toMatchObject({ kind: "VIRTUAL", rank: 4, solvedVirtual: 1, solvedLive: 0 });
  });

  it("upsolve after a wrong live try sums rejected attempts across rows", () => {
    const o = mergeStandings({
      contest: ICPC,
      problems: [P("A")],
      rows: [row("carol", "CONTESTANT", [R(0, 2)], 7), row("carol", "PRACTICE", [R(1, 1, 2147483647)])],
      studentIdByHandle: ids,
    });
    expect(o.cells).toEqual([{ studentId: "c", problemIndex: "A", status: "UPSOLVED", rejectedAttempts: 3, points: null, solvedAtSeconds: null }]);
    expect(o.participations[0]).toMatchObject({ kind: "LIVE", rank: 7, solvedLive: 0, upsolved: 1 });
  });

  it("a live-row solve after the contest ended is an upsolve (time check)", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A")], rows: [row("alice", "CONTESTANT", [R(1, 0, 7201)], 1)], studentIdByHandle: ids });
    expect(o.cells[0]).toMatchObject({ status: "UPSOLVED", solvedAtSeconds: null });
    expect(o.participations[0]).toMatchObject({ kind: "LIVE", solvedLive: 0, upsolved: 1 });
  });

  it("live solve wins over a later practice solve", () => {
    const o = mergeStandings({
      contest: ICPC,
      problems: [P("A")],
      rows: [row("alice", "PRACTICE", [R(1, 5, 9000)]), row("alice", "CONTESTANT", [R(1, 1, 100)], 2)],
      studentIdByHandle: ids,
    });
    expect(o.cells[0]).toMatchObject({ status: "SOLVED_LIVE", rejectedAttempts: 1, solvedAtSeconds: 100 });
  });

  it("attempted only", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A"), P("B")], rows: [row("dave", "CONTESTANT", [R(0, 4), R(0, 0)], 9)], studentIdByHandle: ids });
    expect(o.cells).toEqual([{ studentId: "d", problemIndex: "A", status: "ATTEMPTED", rejectedAttempts: 4, points: null, solvedAtSeconds: null }]);
    expect(o.participations[0]).toMatchObject({ kind: "LIVE", solvedLive: 0 });
  });

  it("IOI: partial score is attempted, full points is solved", () => {
    const o = mergeStandings({
      contest: { type: "IOI", durationSeconds: 7200 },
      problems: [P("A", 100), P("B", 100), P("C")],
      rows: [row("erin", "CONTESTANT", [R(100, 1, 500), R(40, 0, 800), R(0, 0)], 1)],
      studentIdByHandle: ids,
    });
    expect(o.cells.map((c) => [c.problemIndex, c.status, c.points])).toEqual([
      ["A", "SOLVED_LIVE", 100],
      ["B", "ATTEMPTED", 40],
    ]);
  });

  it("IOI problem without points falls back to points > 0", () => {
    const o = mergeStandings({ contest: { type: "IOI", durationSeconds: 7200 }, problems: [P("A")], rows: [row("erin", "CONTESTANT", [R(1, 0, 5)], 1)], studentIdByHandle: ids });
    expect(o.cells[0].status).toBe("SOLVED_LIVE");
  });

  it("absent: a roster student with no row gets nothing", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A")], rows: [row("alice", "CONTESTANT", [R(1, 0, 5)], 1)], studentIdByHandle: ids });
    expect(o.participations.map((p) => p.studentId)).toEqual(["a"]);
  });

  it("practice row with no attempts: PRACTICE_ONLY participation, no cells", () => {
    const o = mergeStandings({ contest: ICPC, problems: [P("A")], rows: [row("bob", "PRACTICE", [R(0, 0)])], studentIdByHandle: ids });
    expect(o.cells).toEqual([]);
    expect(o.participations[0]).toMatchObject({ kind: "PRACTICE_ONLY", rank: null });
  });

  it("MANAGER rows are ignored; unknown handles are reported once", () => {
    const o = mergeStandings({
      contest: ICPC,
      problems: [P("A")],
      rows: [row("alice", "MANAGER", [R(1, 0, 5)]), row("stranger", "CONTESTANT", [R(1, 0, 5)], 1), row("Stranger", "PRACTICE", [R(1, 0, 5)])],
      studentIdByHandle: ids,
    });
    expect(o.cells).toEqual([]);
    expect(o.participations).toEqual([]);
    expect(o.unmatchedHandles).toEqual(["stranger"]);
  });
});
