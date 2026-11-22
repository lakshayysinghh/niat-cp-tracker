import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { StudentConflictError, StudentInputError, updateStudent } from "@/lib/students";
import { isUniqueViolation } from "@/lib/sync/respond";

const uuid = z.uuid();

/** PATCH /api/students/[id] { phone?, name?, cfHandle? } -> 200 { student, verification? } */
export async function PATCH(request: Request, ctx: RouteContext<"/api/students/[id]">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Student not found");

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return jsonError(400, "BAD_REQUEST", "Send any of phone, name, cfHandle");
  const patch = Object.fromEntries(Object.entries(body).filter(([k]) => ["phone", "name", "cfHandle"].includes(k)));
  if (Object.keys(patch).length === 0) return jsonError(400, "BAD_REQUEST", "Send any of phone, name, cfHandle");

  try {
    const result = await updateStudent(id, patch, auth.adminId);
    if (!result) return jsonError(404, "NOT_FOUND", "Student not found");
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof StudentInputError) return jsonError(400, err.code, err.message);
    if (err instanceof StudentConflictError) return jsonError(409, err.code, err.message);
    if (isUniqueViolation(err)) return jsonError(409, "DUPLICATE_HANDLE", "Another student already uses this handle");
    throw err;
  }
}

/** DELETE /api/students/[id] (admin) -> 200 { deleted: true }; cascades to cells and participations. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/students/[id]">) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Student not found");

  const deleted = await db.delete(students).where(eq(students.id, id)).returning({ id: students.id });
  if (deleted.length === 0) return jsonError(404, "NOT_FOUND", "Student not found");
  return NextResponse.json({ deleted: true });
}
