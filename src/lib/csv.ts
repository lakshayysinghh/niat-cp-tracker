import Papa from "papaparse";
import { normalizePhone } from "./phone";

/**
 * Roster CSV parsing and cleaning (IMPLEMENTATION_PLAN.md, Section 7). Pure: no
 * database or network. The same functions serve the dry-run preview and the commit.
 */

export const MAX_ROWS = 2000;
export const MAX_BYTES = 1_000_000;

export type Field = "niat_id" | "phone" | "cf_handle" | "name";

export const HEADER_ALIASES: Record<Field, readonly string[]> = {
  niat_id: ["niat_id", "niat id", "niatid", "student_id", "id"],
  phone: ["phone", "phone_number", "phone number", "mobile", "contact"],
  cf_handle: ["cf_handle", "cf handle", "codeforces_handle", "codeforces handle", "handle", "codeforces"],
  name: ["name", "student_name", "student name", "full_name"],
};
const REQUIRED: readonly Field[] = ["niat_id", "phone", "cf_handle"];

export function resolveField(header: string): Field | null {
  // Spaces and underscores are interchangeable: "Student ID" matches "student_id".
  const norm = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_]+/g, " ");
  const h = norm(header);
  for (const field of Object.keys(HEADER_ALIASES) as Field[]) {
    if (HEADER_ALIASES[field].some((alias) => norm(alias) === h)) return field;
  }
  return null;
}

/** One data row; `row` is the 1-based spreadsheet row (the header is row 1). */
export interface RawRow {
  row: number;
  values: Partial<Record<Field, string>>;
}

export interface CleanRow {
  row: number;
  niatId: string;
  phone: string;
  /** The handle cell as typed, trimmed (URL, @handle or handle). */
  enteredHandle: string;
  /** The extracted handle. */
  cfHandle: string;
  handleLower: string;
  name: string | null;
}

export interface RowFailure {
  row: number;
  niatId?: string;
  reason: string;
}

export type ParseResult = { ok: true; rows: RawRow[] } | { ok: false; error: string };

function fromTable(header: string[], body: string[][], firstRowNumber: number): ParseResult {
  const map = new Map<number, Field>();
  const seen = new Set<Field>();
  header.forEach((h, i) => {
    const f = resolveField(h);
    if (f && !seen.has(f)) {
      map.set(i, f);
      seen.add(f);
    }
  });
  const missing = REQUIRED.filter((f) => !seen.has(f));
  if (missing.length) {
    return {
      ok: false,
      error: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}. Expected headers like niat_id, phone, cf_handle, name.`,
    };
  }
  if (body.length > MAX_ROWS) return { ok: false, error: `Too many rows: ${body.length} (limit ${MAX_ROWS})` };

  const rows: RawRow[] = [];
  body.forEach((cells, i) => {
    const values: RawRow["values"] = {};
    for (const [col, field] of map) values[field] = String(cells[col] ?? "").trim();
    if (Object.values(values).every((v) => !v)) return; // skip fully empty rows
    rows.push({ row: firstRowNumber + i, values });
  });
  return { ok: true, rows };
}

export function parseCsvText(text: string): ParseResult {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return { ok: false, error: "File is larger than 1 MB" };
  const parsed = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false });
  const table = parsed.data.filter((r) => Array.isArray(r));
  const headerIdx = table.findIndex((r) => r.some((c) => String(c).trim() !== ""));
  if (headerIdx === -1) return { ok: false, error: "The file is empty" };
  return fromTable(table[headerIdx].map(String), table.slice(headerIdx + 1), headerIdx + 2);
}

/** JSON `rows` payload: objects whose keys are any accepted header alias. */
export function rowsFromObjects(objects: readonly Record<string, unknown>[]): ParseResult {
  const header = [...new Set(objects.flatMap((o) => Object.keys(o)))];
  const body = objects.map((o) => header.map((h) => (o[h] == null ? "" : String(o[h]))));
  return fromTable(header, body, 2);
}

// ---------------------------------------------------------------- cleaning

const PROFILE_HOSTS = new Set([
  "codeforces.com",
  "www.codeforces.com",
  "mirror.codeforces.com",
  "m1.codeforces.com",
  "codeforces.net",
  "www.codeforces.net",
]);

export function normalizeNiatId(raw: string | null | undefined): { ok: true; niatId: string } | { ok: false; error: string } {
  const v = String(raw ?? "").trim().toUpperCase();
  if (!v) return { ok: false, error: "NIAT ID is required" };
  if (v.length > 64 || /\s/.test(v)) return { ok: false, error: "NIAT ID must not contain spaces" };
  return { ok: true, niatId: v };
}

export function normalizeHandle(raw: string | null | undefined): { ok: true; handle: string } | { ok: false; error: string } {
  let v = String(raw ?? "").trim();
  if (!v) return { ok: false, error: "Codeforces handle is required" };

  const looksLikeUrl = /^https?:\/\//i.test(v) || /^(www\.|m1\.|mirror\.)?codeforces\.(com|net)\//i.test(v);
  if (looksLikeUrl) {
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`);
    } catch {
      return { ok: false, error: "Handle link is not a valid URL" };
    }
    const seg = url.pathname.split("/").filter(Boolean);
    const i = seg.findIndex((s) => s.toLowerCase() === "profile");
    if (!PROFILE_HOSTS.has(url.hostname.toLowerCase()) || i === -1 || !seg[i + 1]) {
      return { ok: false, error: "Handle link must be a Codeforces profile, like https://codeforces.com/profile/tourist" };
    }
    v = decodeURIComponent(seg[i + 1]);
  }

  v = v.replace(/^@/, "");
  if (!v) return { ok: false, error: "Codeforces handle is required" };
  if (v.length > 64 || !/^[A-Za-z0-9_.-]+$/.test(v)) {
    return { ok: false, error: "Handle may contain only letters, digits, _ - and ." };
  }
  return { ok: true, handle: v };
}

export interface StudentInput {
  niatId?: unknown;
  phone?: unknown;
  cfHandle?: unknown;
  name?: unknown;
}

export type CleanOne =
  | { ok: true; value: Omit<CleanRow, "row"> }
  | { ok: false; niatId?: string; reason: string };

/** Clean one student (also used by POST /api/students). */
export function cleanStudent(input: StudentInput): CleanOne {
  const niat = normalizeNiatId(input.niatId == null ? "" : String(input.niatId));
  if (!niat.ok) return { ok: false, reason: niat.error };
  const phone = normalizePhone(input.phone == null ? "" : String(input.phone));
  if (!phone.ok) return { ok: false, niatId: niat.niatId, reason: phone.error };
  const entered = String(input.cfHandle ?? "").trim();
  const handle = normalizeHandle(entered);
  if (!handle.ok) return { ok: false, niatId: niat.niatId, reason: handle.error };
  const name = String(input.name ?? "").trim();
  return {
    ok: true,
    value: {
      niatId: niat.niatId,
      phone: phone.phone,
      enteredHandle: entered,
      cfHandle: handle.handle,
      handleLower: handle.handle.toLowerCase(),
      name: name ? name.slice(0, 200) : null,
    },
  };
}

/** Clean every row and reject in-file duplicates (by NIAT ID and by handle). */
export function cleanRows(rows: readonly RawRow[]): { valid: CleanRow[]; failed: RowFailure[] } {
  const valid: CleanRow[] = [];
  const failed: RowFailure[] = [];
  const niatFirst = new Map<string, number>();
  const handleFirst = new Map<string, number>();

  for (const r of rows) {
    const c = cleanStudent({ niatId: r.values.niat_id, phone: r.values.phone, cfHandle: r.values.cf_handle, name: r.values.name });
    if (!c.ok) {
      failed.push({ row: r.row, niatId: c.niatId, reason: c.reason });
      continue;
    }
    const firstNiat = niatFirst.get(c.value.niatId);
    if (firstNiat !== undefined) {
      failed.push({ row: r.row, niatId: c.value.niatId, reason: `Duplicate NIAT ID ${c.value.niatId}; first seen on row ${firstNiat}` });
      continue;
    }
    const firstHandle = handleFirst.get(c.value.handleLower);
    if (firstHandle !== undefined) {
      failed.push({ row: r.row, niatId: c.value.niatId, reason: `Duplicate handle ${c.value.cfHandle}; first seen on row ${firstHandle}` });
      continue;
    }
    niatFirst.set(c.value.niatId, r.row);
    handleFirst.set(c.value.handleLower, r.row);
    valid.push({ row: r.row, ...c.value });
  }
  return { valid, failed };
}
