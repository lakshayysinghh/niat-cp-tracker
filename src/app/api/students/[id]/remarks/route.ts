import { and, desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { admins, studentRemarks, students } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { isoDate } from "@/lib/homework-csv";
import { jsonError } from "@/lib/http";

const uuid = z.uuid();
const body = z.object({
  remarkDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  content: z.string().trim().min(1, "Write a note").max(2000),
});

async function exists(id: string) {
  const [s] = await db.select({ id: students.id }).from(students).where(eq(students.id, id));
  return Boolean(s);
}

/** GET /api/students/[id]/remarks -> { remarks } newest first */
export async function GET(_request: Request, ctx: RouteContext<"/api/students/[id]/remarks">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success || !(await exists(id))) return jsonError(404, "NOT_FOUND", "Student not found");
  const remarks = await db
    .select({ id: studentRemarks.id, date: studentRemarks.remarkDate, content: studentRemarks.content, by: admins.email, updatedAt: studentRemarks.updatedAt })
    .from(studentRemarks)
    .leftJoin(admins, eq(admins.id, studentRemarks.adminId))
    .where(eq(studentRemarks.studentId, id))
    .orderBy(desc(studentRemarks.remarkDate));
  return NextResponse.json({ remarks });
}

/** POST /api/students/[id]/remarks { remarkDate, content } -> { remark }. One remark per day: saving the same date replaces it. */
export async function POST(request: Request, ctx: RouteContext<"/api/students/[id]/remarks">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success || !(await exists(id))) return jsonError(404, "NOT_FOUND", "Student not found");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", parsed.error.issues[0]?.message ?? "Send { remarkDate, content }");
  const [y, m, d] = parsed.data.remarkDate.split("-").map(Number);
  if (!isoDate(y, m, d)) return jsonError(400, "BAD_DATE", "Not a real date");

  const [remark] = await db
    .insert(studentRemarks)
    .values({ studentId: id, remarkDate: parsed.data.remarkDate, content: parsed.data.content, adminId: auth.adminId })
    .onConflictDoUpdate({
      target: [studentRemarks.studentId, studentRemarks.remarkDate],
      set: { content: parsed.data.content, adminId: auth.adminId, updatedAt: new Date() },
    })
    .returning();
  return NextResponse.json({ remark }, { status: 201 });
}

/** DELETE /api/students/[id]/remarks?remarkId=… -> { deleted: true } */
export async function DELETE(request: Request, ctx: RouteContext<"/api/students/[id]/remarks">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  const remarkId = new URL(request.url).searchParams.get("remarkId") ?? "";
  if (!uuid.safeParse(id).success || !uuid.safeParse(remarkId).success) return jsonError(404, "NOT_FOUND", "Remark not found");
  const deleted = await db
    .delete(studentRemarks)
    .where(and(eq(studentRemarks.id, remarkId), eq(studentRemarks.studentId, id)))
    .returning({ id: studentRemarks.id });
  if (deleted.length === 0) return jsonError(404, "NOT_FOUND", "Remark not found");
  return NextResponse.json({ deleted: true });
}
