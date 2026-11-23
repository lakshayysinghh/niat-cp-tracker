import Papa from "papaparse";
import { normalizeHandle, normalizeNiatId } from "./csv";
import { normalizePhone } from "./phone";

/**
 * Master homework sheet parser (Phase 6). Pure: no database or network.
 * Reads the team's Google Sheet CSV export:
 *   Sr no, Name, Codeforces Username, Phone, College, CF Link,
 *   Sheet #1 (26 Problems), Contest #1 (9 Problems), …, Remarks - 28/08, Remarks - 29/08, …
 * Header names are matched loosely; title rows above the header are skipped.
 */

export const MAX_BYTES = 2_000_000;

export type IdentityField = "srno" | "name" | "handle" | "link" | "phone" | "college" | "niat";

export interface HomeworkColumnSpec {
  index: number;
  title: string;
  problemCount: number;
}

export interface RemarkColumnSpec {
  index: number;
  date: string; // YYYY-MM-DD
  /** a plain "Remarks" column with no date: dated on the import day */
  undated: boolean;
}

export interface ParsedRow {
  row: number; // spreadsheet row (1-based)
  name: string | null;
  handle: string | null; // from Codeforces Username or CF Link
  niatId: string | null;
  phone: string | null; // normalised, or null
  college: string | null;
  scores: Array<{ column: number; solved: number }>;
  remarks: Array<{ date: string; content: string }>;
  warnings: string[];
}

export type ParseResult =
  | { ok: true; homework: HomeworkColumnSpec[]; remarkColumns: RemarkColumnSpec[]; rows: ParsedRow[]; warnings: string[] }
  | { ok: false; error: string };

const ALIASES: Record<IdentityField, readonly string[]> = {
  srno: ["sr no", "sr. no", "sr. no.", "sr no.", "s no", "s. no", "s.no", "sno", "serial no", "serial", "#", "no", "no."],
  name: ["name", "student name", "full name", "student"],
  handle: ["codeforces username", "cf username", "codeforces handle", "cf handle", "handle", "username", "codeforces", "cf id", "codeforces id"],
  link: ["cf link", "codeforces link", "profile", "profile link", "cf profile", "codeforces profile", "link"],
  phone: ["phone", "phone number", "phone no", "mobile", "mobile number", "contact", "contact number"],
  college: ["college", "college name", "campus", "institute", "institution", "university"],
  niat: ["niat id", "niatid", "niat", "student id", "roll no", "roll number", "id"],
};

const norm = (s: string) => s.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_]+/g, " ");

const HOMEWORK_RE = /^(.*\S)\s*\(\s*(\d{1,3})\s*(?:problems?|qs?|questions?)\s*\)\s*$/i;
const REMARK_DATED_RE = /^(?:remarks?|notes?|follow[- ]?up)\s*[-–—:]?\s*(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?\s*$/i;
const REMARK_PLAIN_RE = /^(?:remarks?|notes?|mentor remarks?|follow[- ]?up)$/i;
const ABSENT = new Set(["", "#n/a", "n/a", "na", "-", "—", "–", "absent", "nil", "#value!", "#ref!"]);

export function isoDate(y: number, m: number, d: number): string | null {
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return dt.toISOString().slice(0, 10);
}

/** DD/MM without a year: this year, unless that lands more than a month after today (then last year). */
export function inferRemarkDate(day: number, month: number, year: number | null, today: string): string | null {
  if (year != null) return isoDate(year < 100 ? 2000 + year : year, month, day);
  const t = new Date(today + "T00:00:00Z");
  const y = t.getUTCFullYear();
  const candidate = isoDate(y, month, day);
  if (!candidate) return null;
  const limit = new Date(t.getTime() + 31 * 86400000).toISOString().slice(0, 10);
  return candidate > limit ? isoDate(y - 1, month, day) : candidate;
}

export type HeaderKind =
  | { kind: IdentityField }
  | { kind: "homework"; title: string; problemCount: number }
  | { kind: "remark"; date: string; undated: boolean }
  | { kind: "ignore" };

export function classifyHeader(raw: string, today: string): HeaderKind {
  const h = raw.replace(/^﻿/, "").trim().replace(/\s+/g, " ");
  if (!h) return { kind: "ignore" };

  const hw = HOMEWORK_RE.exec(h);
  if (hw) {
    const n = Number(hw[2]);
    if (n > 0) return { kind: "homework", title: hw[1].trim(), problemCount: n };
  }
  const rd = REMARK_DATED_RE.exec(h);
  if (rd) {
    const date = inferRemarkDate(Number(rd[1]), Number(rd[2]), rd[3] ? Number(rd[3]) : null, today);
    if (date) return { kind: "remark", date, undated: false };
  }
  if (REMARK_PLAIN_RE.test(h)) return { kind: "remark", date: today, undated: true };

  const n = norm(h);
  for (const field of Object.keys(ALIASES) as IdentityField[]) {
    if (ALIASES[field].some((a) => norm(a) === n)) return { kind: field };
  }
  return { kind: "ignore" };
}

/** Score cell -> solved count. Blank / #N/A / "-" = 0 (absent), never an error. */
export function parseScore(cell: string, max: number): { ok: true; value: number } | { ok: false; error: string } {
  const v = cell.trim().toLowerCase();
  if (ABSENT.has(v)) return { ok: true, value: 0 };
  const m = /^(\d{1,4})(?:\s*\/\s*\d{1,4})?$/.exec(v); // "24" or "24/26"
  if (!m) return { ok: false, error: `“${cell.trim()}” is not a number` };
  const n = Number(m[1]);
  if (n > max) return { ok: false, error: `${n} is more than the ${max} problems in this sheet` };
  return { ok: true, value: n };
}

export function parseMasterSheet(text: string, today: string): ParseResult {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return { ok: false, error: "File is larger than 2 MB" };
  const table = Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: false }).data.filter(Array.isArray);

  // Header = first row (within the first 10) that has an identity column and a homework/remark column.
  let headerIdx = -1;
  let kinds: HeaderKind[] = [];
  for (let i = 0; i < Math.min(10, table.length); i++) {
    const k = table[i].map((c) => classifyHeader(String(c ?? ""), today));
    const hasId = k.some((x) => x.kind === "handle" || x.kind === "link" || x.kind === "niat");
    const hasData = k.some((x) => x.kind === "homework" || x.kind === "remark");
    if (hasId && hasData) {
      headerIdx = i;
      kinds = k;
      break;
    }
  }
  if (headerIdx === -1) {
    return {
      ok: false,
      error: 'Could not find the header row. It needs a "Codeforces Username" (or "CF Link" / "NIAT ID") column and at least one column like "Sheet #1 (26 Problems)" or "Remarks - 28/08".',
    };
  }

  const warnings: string[] = [];
  const pick = (f: IdentityField) => kinds.findIndex((k) => k.kind === f);
  const col = { name: pick("name"), handle: pick("handle"), link: pick("link"), phone: pick("phone"), college: pick("college"), niat: pick("niat") };

  const homework: HomeworkColumnSpec[] = [];
  const seenTitles = new Map<string, number>();
  const remarkColumns: RemarkColumnSpec[] = [];
  const seenDates = new Set<string>();
  kinds.forEach((k, i) => {
    if (k.kind === "homework") {
      const key = k.title.toLowerCase();
      if (seenTitles.has(key)) {
        warnings.push(`Column “${k.title}” appears twice; only the first is used`);
        return;
      }
      seenTitles.set(key, i);
      homework.push({ index: i, title: k.title, problemCount: k.problemCount });
    } else if (k.kind === "remark") {
      if (seenDates.has(k.date)) {
        warnings.push(`Two remark columns for ${k.date}; only the first is used`);
        return;
      }
      seenDates.add(k.date);
      remarkColumns.push({ index: i, date: k.date, undated: k.undated });
    }
  });
  if (remarkColumns.some((r) => r.undated)) warnings.push(`An undated "Remarks" column is saved as today's remark (${today})`);

  const cell = (r: string[], i: number) => (i >= 0 ? String(r[i] ?? "").trim() : "");
  const rows: ParsedRow[] = [];
  table.slice(headerIdx + 1).forEach((r, offset) => {
    const rowNo = headerIdx + 2 + offset;
    if (r.every((c) => !String(c ?? "").trim())) return;

    const rowWarnings: string[] = [];
    let handle: string | null = null;
    for (const raw of [cell(r, col.handle), cell(r, col.link)]) {
      if (!raw || handle) continue;
      const h = normalizeHandle(raw);
      if (h.ok) handle = h.handle;
      else rowWarnings.push(`handle “${raw}”: ${h.error}`);
    }
    const niatRaw = cell(r, col.niat);
    const niat = niatRaw ? normalizeNiatId(niatRaw) : null;
    const phoneRaw = cell(r, col.phone);
    const phone = phoneRaw ? normalizePhone(phoneRaw) : null;

    const scores: ParsedRow["scores"] = [];
    for (const hw of homework) {
      const s = parseScore(cell(r, hw.index), hw.problemCount);
      if (s.ok) scores.push({ column: hw.index, solved: s.value });
      else rowWarnings.push(`${hw.title}: ${s.error} (skipped)`);
    }
    const remarks = remarkColumns.map((rc) => ({ date: rc.date, content: cell(r, rc.index) })).filter((x) => x.content && !ABSENT.has(x.content.toLowerCase()));

    rows.push({
      row: rowNo,
      name: cell(r, col.name) || null,
      handle,
      niatId: niat && niat.ok ? niat.niatId : null,
      phone: phone && phone.ok ? phone.phone : null,
      college: cell(r, col.college) || null,
      scores,
      remarks,
      warnings: rowWarnings,
    });
  });

  return { ok: true, homework, remarkColumns, rows, warnings };
}
