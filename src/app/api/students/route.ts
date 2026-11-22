import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { createStudent, StudentConflictError, StudentInputError } from "@/lib/students";
import { isUniqueViolation } from "@/lib/sync/respond";

/** POST /api/students { niatId, phone, cfHandle, name? } -> 201 { student, verification } */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body || typeof body !== "object") return jsonError(400, "BAD_REQUEST", "Send a JSON body with niatId, phone, cfHandle and name");

  try {
    const { student, verification } = await createStudent(body, auth.adminId);
    return NextResponse.json({ student, verification }, { status: 201 });
  } catch (err) {
    if (err instanceof StudentInputError) return jsonError(400, err.code, err.message);
    if (err instanceof StudentConflictError) return jsonError(409, err.code, err.message);
    if (isUniqueViolation(err)) return jsonError(409, "DUPLICATE", "A student with this NIAT ID or handle already exists");
    throw err;
  }
}
