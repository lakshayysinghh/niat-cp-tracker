import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { cleanRows, normalizeHandle, normalizeNiatId, parseCsvText, resolveField, rowsFromObjects } from "@/lib/csv";

const roster = readFileSync(path.join(__dirname, "fixtures", "roster-734032-test.csv"), "utf8");

describe("header aliases", () => {
  it.each([
    ["NIAT ID", "niat_id"],
    ["niatid", "niat_id"],
    ["Student_ID", "niat_id"],
    ["id", "niat_id"],
    ["Phone Number", "phone"],
    ["mobile", "phone"],
    ["contact", "phone"],
    ["Codeforces Handle", "cf_handle"],
    ["handle", "cf_handle"],
    ["codeforces", "cf_handle"],
    ["Full_Name", "name"],
    ["student name", "name"],
    ["﻿niat_id", "niat_id"],
    ["email", null],
  ])("%j -> %s", (h, f) => expect(resolveField(h)).toBe(f));
});

describe("normalizeNiatId", () => {
  it("trims and uppercases", () => expect(normalizeNiatId("  niat2026001 ")).toEqual({ ok: true, niatId: "NIAT2026001" }));
  it("rejects empty and spaced ids", () => {
    expect(normalizeNiatId("").ok).toBe(false);
    expect(normalizeNiatId("NIAT 01").ok).toBe(false);
  });
});

describe("normalizeHandle", () => {
  it.each([
    ["tourist", "tourist"],
    ["@ecnerwala", "ecnerwala"],
    ["https://codeforces.com/profile/jiangly", "jiangly"],
    ["http://www.codeforces.com/profile/Benq/", "Benq"],
    ["https://mirror.codeforces.com/profile/priya.m.reddy2006?locale=en", "priya.m.reddy2006"],
    ["m1.codeforces.com/profile/Y_ABHILASH_REDDY_2710", "Y_ABHILASH_REDDY_2710"],
    ["https://codeforces.net/profile/a-b_c.d", "a-b_c.d"],
  ])("%s -> %s", (raw, handle) => expect(normalizeHandle(raw)).toEqual({ ok: true, handle }));

  it.each([
    ["", "required"],
    ["two words", "letters, digits"],
    ["bad$char", "letters, digits"],
    ["https://example.com/profile/tourist", "Codeforces profile"],
    ["https://codeforces.com/contest/1", "Codeforces profile"],
  ])("rejects %j", (raw, msg) => {
    const r = normalizeHandle(raw);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain(msg);
  });
});

describe("test roster fixture (roster-734032-test.csv)", () => {
  const parsed = parseCsvText(roster);
  if (!parsed.ok) throw new Error(parsed.error);
  const { valid, failed } = cleanRows(parsed.rows);

  it("cleans all 13 rows with no failures", () => {
    expect(failed).toEqual([]);
    expect(valid).toHaveLength(13);
  });

  it("normalises every phone to +91XXXXXXXXXX", () => {
    expect(valid.map((r) => r.phone)).toEqual(Array.from({ length: 13 }, (_, i) => `+9190000000${String(i + 1).padStart(2, "0")}`));
  });

  it("uppercases NIAT IDs and keeps them identifiable as test data", () => {
    expect(valid.map((r) => r.niatId)).toEqual(Array.from({ length: 13 }, (_, i) => `TEST${String(i + 1).padStart(3, "0")}`));
  });

  it("extracts handles from URLs and @, keeping what was typed", () => {
    const byNiat = Object.fromEntries(valid.map((r) => [r.niatId, r]));
    expect(byNiat.TEST003).toMatchObject({ cfHandle: "NotMyBug", handleLower: "notmybug", enteredHandle: "https://codeforces.com/profile/NotMyBug" });
    expect(byNiat.TEST005).toMatchObject({ cfHandle: "Sattunashedixd14", enteredHandle: "@Sattunashedixd14" });
    expect(byNiat.TEST013.cfHandle).toBe("zz_fake_handle_test");
  });

  it("blank name becomes null; spreadsheet row numbers start at 2", () => {
    expect(valid.find((r) => r.niatId === "TEST007")?.name).toBeNull();
    expect(valid[0].row).toBe(2);
    expect(valid[12].row).toBe(14);
  });
});

describe("cleanRows: per-row errors and in-file duplicates", () => {
  const csv = [
    "Student ID,Mobile,Codeforces Handle,Student Name",
    "A1,9876543210,tourist,One",
    "",
    "a1,9876543211,Benq,Duplicate NIAT (case-insensitive)",
    "A2,9876543212,TOURIST,Duplicate handle (case-insensitive)",
    "A3,12345,jiangly,Bad phone",
    "A4,9876543213,bad handle,Bad handle",
    ",9876543214,someone,Missing NIAT",
    "A5,9876543215,ecnerwala,",
  ].join("\r\n");
  const parsed = parseCsvText(csv);
  if (!parsed.ok) throw new Error(parsed.error);
  const { valid, failed } = cleanRows(parsed.rows);

  it("keeps only the clean, first-seen rows", () => {
    expect(valid.map((r) => [r.row, r.niatId])).toEqual([
      [2, "A1"],
      [9, "A5"],
    ]);
  });

  it("explains each rejected row, naming the first row for duplicates", () => {
    expect(failed).toEqual([
      { row: 4, niatId: "A1", reason: "Duplicate NIAT ID A1; first seen on row 2" },
      { row: 5, niatId: "A2", reason: "Duplicate handle TOURIST; first seen on row 2" },
      { row: 6, niatId: "A3", reason: "Phone must be a 10-digit Indian mobile number" },
      { row: 7, niatId: "A4", reason: "Handle may contain only letters, digits, _ - and ." },
      { row: 8, niatId: undefined, reason: "NIAT ID is required" },
    ]);
  });
});

describe("file-level errors", () => {
  it("reports missing required columns", () => {
    const r = parseCsvText("niat_id,name\nA1,x");
    expect(r).toEqual({ ok: false, error: expect.stringContaining("phone, cf_handle") });
  });
  it("rejects an empty file", () => expect(parseCsvText("\n\n").ok).toBe(false));
  it("rejects more than 2,000 rows", () => {
    const body = Array.from({ length: 2001 }, (_, i) => `N${i},9876543210,h${i}`).join("\n");
    expect(parseCsvText(`niat_id,phone,cf_handle\n${body}`)).toEqual({ ok: false, error: expect.stringContaining("Too many rows") });
  });
  it("rejects files over 1 MB", () => expect(parseCsvText("x".repeat(1_000_001)).ok).toBe(false));
});

describe("rowsFromObjects (JSON rows payload)", () => {
  it("accepts alias keys", () => {
    const r = rowsFromObjects([{ "NIAT ID": "x1", phone_number: "9876543210", handle: "tourist" }]);
    if (!r.ok) throw new Error(r.error);
    expect(cleanRows(r.rows).valid[0]).toMatchObject({ row: 2, niatId: "X1", phone: "+919876543210", cfHandle: "tourist", name: null });
  });
});
