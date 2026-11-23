import { describe, expect, it } from "vitest";
import { matchesContestQuery, type SearchableContest } from "@/lib/contest-search";

const nt: SearchableContest = { title: "Number theory contest, batch-1", cfContestId: 734032, groupCode: "vP4zGe21UV", kind: "GROUP", startsAt: "2026-11-19T09:00:00Z" };
const stl: SearchableContest = { title: "STL contest", cfContestId: 720741, groupCode: "vP4zGe21UV", kind: "GROUP", startsAt: "2026-10-01T09:00:00Z" };
const gym: SearchableContest = { title: "USACO Guide Problem Submission", cfContestId: 102951, groupCode: null, kind: "GYM", startsAt: null };

describe("matchesContestQuery", () => {
  it("empty query matches everything", () => expect([nt, stl, gym].every((c) => matchesContestQuery(c, "  "))).toBe(true));
  it("matches name words in any order, case-insensitive", () => {
    expect(matchesContestQuery(nt, "THEORY number")).toBe(true);
    expect(matchesContestQuery(stl, "theory")).toBe(false);
  });
  it("every word must match (narrowing)", () => {
    expect(matchesContestQuery(nt, "number theory nov")).toBe(true);
    expect(matchesContestQuery(nt, "number theory oct")).toBe(false);
  });
  it("matches contest id, group code and type", () => {
    expect(matchesContestQuery(nt, "734032")).toBe(true);
    expect(matchesContestQuery(stl, "7207")).toBe(true);
    expect(matchesContestQuery(nt, "vp4zge21uv")).toBe(true);
    expect(matchesContestQuery(gym, "gym")).toBe(true);
    expect(matchesContestQuery(nt, "gym")).toBe(false);
  });
  it("matches IST dates and full month names", () => {
    expect(matchesContestQuery(nt, "19 nov")).toBe(true);
    expect(matchesContestQuery(stl, "october")).toBe(true);
    expect(matchesContestQuery(stl, "2026")).toBe(true);
  });
});
