import "server-only";
import { asc, eq, max, sql } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { homeworkColumns, homeworkScores, studentRemarks, students } from "@/db/schema";
import { normalizeHandle } from "@/lib/csv";
import { parseMasterSheet } from "@/lib/homework-csv";
import { istDate } from "@/lib/sync/practice";
import { getDefaultBatchId } from "@/lib/sync/runs";

/**
 * Master-sheet import (Phase 6). Plan = read-only preview; commit = one atomic db.batch.
 * Students are matched by Codeforces handle (current or as originally typed), then NIAT ID,
 * then phone. Columns are matched to existing homework columns by title (case-insensitive).
 */

export interface ImportPreview {
  columns: Array<{ title: string; problemCount: number; status: "new" | "existing" | "count-changed"; previousCount?: number }>;
  remarkDates: string[];
  matched: Array<{ row: number; studentId: string; niatId: string; name: string | null; matchedBy: "handle" | "niat" | "phone" }>;
  unmatched: Array<{ row: number; name: string | null; handle: string | null; reason: string }>;
  rowWarnings: Array<{ row: number; name: string | null; warning: string }>;
  warnings: string[];
  scoreCount: number;
  remarkCount: number;
}

type Plan =
  | { ok: false; error: string }
  | {
      ok: true;
      preview: ImportPreview;
      write: {
        columns: Array<{ title: string; problemCount: number; existingId?: string }>;
        scores: Array<{ title: string; studentId: string; solved: number }>;
        remarks: Array<{ studentId: string; date: string; content: string }>;
      };
    };

export async function planHomeworkImport(text: string): Promise<Plan> {
  const today = istDate();
  const parsed = parseMasterSheet(text, today);
  if (!parsed.ok) return parsed;

  const batchId = await getDefaultBatchId();
  const [roster, existing] = await Promise.all([
    db
      .select({ id: students.id, niatId: students.niatId, name: students.name, phone: students.phone, handleLower: students.handleLower, enteredHandle: students.enteredHandle })
      .from(students)
      .where(eq(students.batchId, batchId)),
    db.select().from(homeworkColumns).where(eq(homeworkColumns.batchId, batchId)),
  ]);

  const byHandle = new Map<string, (typeof roster)[number]>();
  for (const s of roster) {
    byHandle.set(s.handleLower, s);
    const typed = normalizeHandle(s.enteredHandle);
    if (typed.ok) byHandle.set(typed.handle.toLowerCase(), s);
  }
  const byNiat = new Map(roster.map((s) => [s.niatId, s]));
  const byPhone = new Map(roster.map((s) => [s.phone, s]));
  const existingByTitle = new Map(existing.map((c) => [c.title.toLowerCase(), c]));

  const preview: ImportPreview = {
    columns: parsed.homework.map((h) => {
      const e = existingByTitle.get(h.title.toLowerCase());
      if (!e) return { title: h.title, problemCount: h.problemCount, status: "new" };
      return e.problemCount === h.problemCount
        ? { title: e.title, problemCount: h.problemCount, status: "existing" }
        : { title: e.title, problemCount: h.problemCount, status: "count-changed", previousCount: e.problemCount };
    }),
    remarkDates: parsed.remarkColumns.map((r) => r.date),
    matched: [],
    unmatched: [],
    rowWarnings: [],
    warnings: parsed.warnings,
    scoreCount: 0,
    remarkCount: 0,
  };
  const titleOf = new Map(parsed.homework.map((h) => [h.index, existingByTitle.get(h.title.toLowerCase())?.title ?? h.title]));
  const write: Extract<Plan, { ok: true }>["write"] = {
    columns: parsed.homework.map((h) => ({ title: titleOf.get(h.index)!, problemCount: h.problemCount, existingId: existingByTitle.get(h.title.toLowerCase())?.id })),
    scores: [],
    remarks: [],
  };

  const seen = new Map<string, number>();
  for (const r of parsed.rows) {
    let s: (typeof roster)[number] | undefined;
    let matchedBy: "handle" | "niat" | "phone" = "handle";
    if (r.handle) s = byHandle.get(r.handle.toLowerCase());
    if (!s && r.niatId) {
      s = byNiat.get(r.niatId);
      matchedBy = "niat";
    }
    if (!s && r.phone) {
      s = byPhone.get(r.phone);
      matchedBy = "phone";
    }
    if (!s) {
      preview.unmatched.push({
        row: r.row,
        name: r.name,
        handle: r.handle,
        reason: r.handle || r.niatId || r.phone ? "Not on the Batch 1 roster (no matching handle, NIAT ID or phone)" : "No handle, NIAT ID or phone in this row",
      });
      continue;
    }
    const first = seen.get(s.id);
    if (first !== undefined) {
      preview.unmatched.push({ row: r.row, name: r.name, handle: r.handle, reason: `Same student as row ${first}; this row is skipped` });
      continue;
    }
    seen.set(s.id, r.row);
    preview.matched.push({ row: r.row, studentId: s.id, niatId: s.niatId, name: s.name, matchedBy });
    for (const w of r.warnings) preview.rowWarnings.push({ row: r.row, name: r.name ?? s.name, warning: w });
    for (const sc of r.scores) write.scores.push({ title: titleOf.get(sc.column)!, studentId: s.id, solved: sc.solved });
    for (const rm of r.remarks) write.remarks.push({ studentId: s.id, date: rm.date, content: rm.content.slice(0, 2000) });
  }
  preview.scoreCount = write.scores.length;
  preview.remarkCount = write.remarks.length;
  return { ok: true, preview, write };
}

export async function commitHomeworkImport(plan: Extract<Plan, { ok: true }>, adminId: string) {
  const batchId = await getDefaultBatchId();
  const now = new Date();
  const [{ maxOrder }] = await db.select({ maxOrder: max(homeworkColumns.sortOrder) }).from(homeworkColumns).where(eq(homeworkColumns.batchId, batchId));

  // 1. Columns: create new ones (in sheet order, after existing columns); refresh problem counts.
  let order = (maxOrder ?? -1) + 1;
  const fresh = plan.write.columns.filter((c) => !c.existingId);
  const created = fresh.length
    ? await db
        .insert(homeworkColumns)
        .values(fresh.map((c) => ({ batchId, title: c.title, problemCount: c.problemCount, sortOrder: order++, lastImportedAt: now })))
        .returning({ id: homeworkColumns.id, title: homeworkColumns.title })
    : [];
  const idByTitle = new Map<string, string>([
    ...plan.write.columns.filter((c) => c.existingId).map((c) => [c.title, c.existingId!] as const),
    ...created.map((c) => [c.title, c.id] as const),
  ]);

  // 2. Scores, remarks and the existing columns' counts in one atomic batch.
  const stmts: BatchItem<"pg">[] = plan.write.columns
    .filter((c) => c.existingId)
    .map((c) => db.update(homeworkColumns).set({ problemCount: c.problemCount, lastImportedAt: now }).where(eq(homeworkColumns.id, c.existingId!)));
  const scoreRows = plan.write.scores.map((s) => ({ columnId: idByTitle.get(s.title)!, studentId: s.studentId, solved: s.solved, source: "IMPORT" as const, updatedBy: adminId }));
  for (let i = 0; i < scoreRows.length; i += 1000) {
    stmts.push(
      db
        .insert(homeworkScores)
        .values(scoreRows.slice(i, i + 1000))
        .onConflictDoUpdate({
          target: [homeworkScores.columnId, homeworkScores.studentId],
          set: { solved: sql`excluded.solved`, source: "IMPORT", updatedBy: sql`excluded.updated_by`, updatedAt: now },
        }),
    );
  }
  const remarkRows = plan.write.remarks.map((r) => ({ studentId: r.studentId, remarkDate: r.date, content: r.content, adminId }));
  for (let i = 0; i < remarkRows.length; i += 1000) {
    stmts.push(
      db
        .insert(studentRemarks)
        .values(remarkRows.slice(i, i + 1000))
        .onConflictDoUpdate({
          target: [studentRemarks.studentId, studentRemarks.remarkDate],
          set: { content: sql`excluded.content`, adminId: sql`excluded.admin_id`, updatedAt: now },
        }),
    );
  }
  if (stmts.length) await db.batch(stmts as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  return {
    columnsCreated: created.length,
    columnsUpdated: plan.write.columns.length - created.length,
    scores: scoreRows.length,
    remarks: remarkRows.length,
    studentsMatched: plan.preview.matched.length,
    unmatched: plan.preview.unmatched.length,
  };
}

/** Columns in display order. */
export function listColumns(batchId: string) {
  return db.select().from(homeworkColumns).where(eq(homeworkColumns.batchId, batchId)).orderBy(asc(homeworkColumns.sortOrder), asc(homeworkColumns.createdAt));
}
