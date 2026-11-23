import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { admins, homeworkScores, studentRemarks, students } from "@/db/schema";
import { listColumns } from "@/lib/homework";
import { getDefaultBatchId } from "@/lib/sync/runs";

/** Server-only reads for /homework and the student page (Phase 6). Missing score = 0. */

export interface HomeworkColumnView {
  id: string;
  title: string;
  problemCount: number;
  groupCode: string | null;
  cfContestId: number | null;
  lastImportedAt: Date | null;
}

export interface RemarkView {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  by: string | null;
  updatedAt: Date;
}

export interface HomeworkStudentRow {
  id: string;
  niatId: string;
  name: string | null;
  cfHandle: string;
  handleStatus: "UNVERIFIED" | "VALID" | "INVALID";
  phone: string;
  college: string | null;
  scores: Record<string, { solved: number; source: "IMPORT" | "MANUAL"; updatedAt: Date }>;
  remarks: RemarkView[]; // newest first
}

const columnView = (c: Awaited<ReturnType<typeof listColumns>>[number]): HomeworkColumnView => ({
  id: c.id,
  title: c.title,
  problemCount: c.problemCount,
  groupCode: c.groupCode,
  cfContestId: c.cfContestId,
  lastImportedAt: c.lastImportedAt,
});

async function remarksFor(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  return db
    .select({ id: studentRemarks.id, studentId: studentRemarks.studentId, date: studentRemarks.remarkDate, content: studentRemarks.content, by: admins.email, updatedAt: studentRemarks.updatedAt })
    .from(studentRemarks)
    .leftJoin(admins, eq(admins.id, studentRemarks.adminId))
    .where(inArray(studentRemarks.studentId, studentIds))
    .orderBy(desc(studentRemarks.remarkDate));
}

export async function getHomeworkMaster() {
  const batchId = await getDefaultBatchId();
  const [cols, roster] = await Promise.all([
    listColumns(batchId),
    db
      .select({ id: students.id, niatId: students.niatId, name: students.name, cfHandle: students.cfHandle, handleStatus: students.handleStatus, phone: students.phone, college: students.college })
      .from(students)
      .where(eq(students.batchId, batchId))
      .orderBy(asc(students.name), asc(students.niatId)),
  ]);
  const ids = roster.map((s) => s.id);
  const [scores, remarks] = await Promise.all([
    cols.length && ids.length
      ? db.select().from(homeworkScores).where(inArray(homeworkScores.columnId, cols.map((c) => c.id)))
      : Promise.resolve([] as Array<typeof homeworkScores.$inferSelect>),
    remarksFor(ids),
  ]);

  const rows: HomeworkStudentRow[] = roster.map((s) => ({ ...s, scores: {}, remarks: [] }));
  const byId = new Map(rows.map((r) => [r.id, r]));
  for (const sc of scores) {
    const r = byId.get(sc.studentId);
    if (r) r.scores[sc.columnId] = { solved: sc.solved, source: sc.source, updatedAt: sc.updatedAt };
  }
  for (const rm of remarks) byId.get(rm.studentId)?.remarks.push({ id: rm.id, date: rm.date, content: rm.content, by: rm.by, updatedAt: rm.updatedAt });

  const remarkDates = [...new Set(remarks.map((r) => r.date))].sort();
  const colleges = [...new Set(roster.map((s) => s.college).filter((c): c is string => Boolean(c)))].sort();
  return { columns: cols.map(columnView), rows, remarkDates, colleges };
}

export type HomeworkMaster = Awaited<ReturnType<typeof getHomeworkMaster>>;

export async function getStudentHomework(studentId: string, batchId: string) {
  const [cols, scores, remarks] = await Promise.all([
    listColumns(batchId),
    db.select().from(homeworkScores).where(eq(homeworkScores.studentId, studentId)),
    remarksFor([studentId]),
  ]);
  const by = new Map(scores.map((s) => [s.columnId, s.solved]));
  return {
    columns: cols.map((c) => ({ ...columnView(c), solved: by.get(c.id) ?? 0 })),
    remarks: remarks.map((r) => ({ id: r.id, date: r.date, content: r.content, by: r.by, updatedAt: r.updatedAt })),
  };
}
