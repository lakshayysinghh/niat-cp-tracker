import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { classifyHeader, inferRemarkDate, parseMasterSheet, parseScore } from "@/lib/homework-csv";

const TODAY = "2026-11-22";

describe("classifyHeader", () => {
  it.each([
    ["Sheet #1 (26 Problems)", { kind: "homework", title: "Sheet #1", problemCount: 26 }],
    ["Contest #3.1 (9 problems)", { kind: "homework", title: "Contest #3.1", problemCount: 9 }],
    ["Sheet 2 - Loops ( 26 Problems )", { kind: "homework", title: "Sheet 2 - Loops", problemCount: 26 }],
    ["Remarks - 28/08", { kind: "remark", date: "2026-08-28", undated: false }],
    ["Remarks – 1/9", { kind: "remark", date: "2026-09-01", undated: false }],
    ["Remarks - 28/12", { kind: "remark", date: "2025-12-28", undated: false }], // > 1 month ahead -> last year
    ["Remarks - 15/12", { kind: "remark", date: "2026-12-15", undated: false }], // within a month -> this year
    ["Remarks - 05/01/2027", { kind: "remark", date: "2027-01-05", undated: false }],
    ["Remarks", { kind: "remark", date: TODAY, undated: true }],
    ["Codeforces Username", { kind: "handle" }],
    ["CF Link", { kind: "link" }],
    ["Sr no", { kind: "srno" }],
    ["College", { kind: "college" }],
    ["Phone", { kind: "phone" }],
    ["NIAT ID", { kind: "niat" }],
    ["Something else", { kind: "ignore" }],
  ])("%j", (h, expected) => expect(classifyHeader(h, TODAY)).toEqual(expected));

  it("rejects impossible remark dates", () => expect(classifyHeader("Remarks - 31/02", TODAY).kind).toBe("ignore"));
});

describe("inferRemarkDate", () => {
  it("keeps dates up to a month ahead in this year", () => expect(inferRemarkDate(20, 12, null, TODAY)).toBe("2026-12-20"));
  it("moves dates further ahead to last year", () => expect(inferRemarkDate(25, 12, null, TODAY)).toBe("2025-12-25"));
  it("uses an explicit two-digit year", () => expect(inferRemarkDate(1, 9, 26, TODAY)).toBe("2026-09-01"));
});

describe("parseScore", () => {
  it.each(["", "#N/A", "n/a", "-", "—", "absent"])("%j is 0 (absent)", (c) => expect(parseScore(c, 26)).toEqual({ ok: true, value: 0 }));
  it("reads plain and x/y numbers", () => {
    expect(parseScore("24", 26)).toEqual({ ok: true, value: 24 });
    expect(parseScore(" 24/26 ", 26)).toEqual({ ok: true, value: 24 });
  });
  it("rejects text and over-max values", () => {
    expect(parseScore("abc", 26).ok).toBe(false);
    expect(parseScore("27", 26).ok).toBe(false);
  });
});

describe("parseMasterSheet (sample fixture)", () => {
  const text = readFileSync(path.join(__dirname, "fixtures", "master-sheet-sample.csv"), "utf8");
  const r = parseMasterSheet(text, TODAY);
  if (!r.ok) throw new Error(r.error);

  it("skips the title row and finds the header", () => {
    expect(r.homework.map((h) => [h.title, h.problemCount])).toEqual([
      ["Sheet #1", 26],
      ["Contest #1", 9],
      ["Sheet #2", 26],
    ]);
    expect(r.remarkColumns.map((c) => c.date)).toEqual(["2026-08-28", "2026-08-29", "2026-09-01"]);
  });

  it("reads 5 data rows with spreadsheet row numbers; skips blank rows", () => {
    expect(r.rows.map((x) => x.row)).toEqual([3, 4, 5, 6, 7]);
  });

  it("takes the handle from the username, else the CF link, stripping @", () => {
    expect(r.rows.map((x) => x.handle)).toEqual(["usecarelessly18", "priya.m.reddy2006", "NotMyBug", "zz_not_on_roster", "Sattunashedixd14"]);
  });

  it("normalises phones and keeps colleges", () => {
    expect(r.rows[0].phone).toBe("+919000000001");
    expect(r.rows[2].college).toBe("Takshashila");
  });

  it("turns #N/A, blank and - into 0", () => {
    const sb = Object.fromEntries(r.rows[1].scores.map((s) => [s.column, s.solved]));
    expect(Object.values(sb)).toEqual([24, 0, 0]);
    expect(r.rows[2].scores.map((s) => s.solved)).toEqual([0, 3, 0]);
  });

  it("skips bad scores with a row warning", () => {
    const bad = r.rows[4];
    expect(bad.scores.map((s) => s.solved)).toEqual([10]);
    expect(bad.warnings).toEqual(["Sheet #1: 27 is more than the 26 problems in this sheet (skipped)", "Contest #1: “abc” is not a number (skipped)"]);
  });

  it("collects non-empty dated remarks only", () => {
    expect(r.rows[0].remarks).toEqual([
      { date: "2026-08-28", content: "Doing well" },
      { date: "2026-09-01", content: "Finished sheet 2 early" },
    ]);
    expect(r.rows[1].remarks).toEqual([{ date: "2026-08-29", content: "Needs help with loops" }]);
    expect(r.rows[2].remarks).toEqual([]);
  });
});

describe("parseMasterSheet errors", () => {
  it("needs an identity column and a data column", () => {
    const r = parseMasterSheet("Name,Phone\nA,9876543210", TODAY);
    expect(r.ok).toBe(false);
  });
  it("warns on a duplicated column title", () => {
    const r = parseMasterSheet("CF Handle,Sheet 1 (5 Problems),Sheet 1 (5 Problems)\ntourist,5,4", TODAY);
    if (!r.ok) throw new Error(r.error);
    expect(r.homework).toHaveLength(1);
    expect(r.warnings[0]).toContain("appears twice");
  });
});
