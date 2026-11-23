import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { homeworkColumns, homeworkScores, students } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const body = z.object({ columnId: z.uuid(), studentId: z.uuid(), solved: z.number().int().min(0).max(200) });

/** PUT /api/homework/scores { columnId, studentId, solved } -> { score }. A manual correction (source MANUAL). */
export async function PUT(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send { columnId, studentId, solved }");
  const { columnId, studentId, solved } = parsed.data;

  const [[col], [stu]] = await Promise.all([
    db.select({ problemCount: homeworkColumns.problemCount, batchId: homeworkColumns.batchId }).from(homeworkColumns).where(eq(homeworkColumns.id, columnId)),
    db.select({ batchId: students.batchId }).from(students).where(eq(students.id, studentId)),
  ]);
  if (!col || !stu || col.batchId !== stu.batchId) return jsonError(404, "NOT_FOUND", "Column or student not found");
  if (solved > col.problemCount) return jsonError(400, "TOO_MANY", `This sheet has ${col.problemCount} problems`);

  const now = new Date();
  const [score] = await db
    .insert(homeworkScores)
    .values({ columnId, studentId, solved, source: "MANUAL", updatedBy: auth.adminId })
    .onConflictDoUpdate({
      target: [homeworkScores.columnId, homeworkScores.studentId],
      set: { solved, source: "MANUAL", updatedBy: auth.adminId, updatedAt: now },
    })
    .returning();
  return NextResponse.json({ score });
}
