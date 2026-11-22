import { and, inArray, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { students } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { verifyHandles } from "@/lib/sync/handles";
import { withLock } from "@/lib/sync/lock";
import { syncErrorResponse } from "@/lib/sync/respond";

const body = z.object({ studentIds: z.array(z.uuid()).max(2000).optional() }).default({});

/** POST /api/students/verify-handles { studentIds? } (default: every handle not VALID) */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;

  const text = await request.text();
  let json: unknown = {};
  try {
    json = text ? JSON.parse(text) : {};
  } catch {
    return jsonError(400, "BAD_REQUEST", "Body must be JSON");
  }
  const parsed = body.safeParse(json);
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "studentIds must be an array of student ids");

  const ids = parsed.data.studentIds?.length
    ? parsed.data.studentIds
    : (await db.select({ id: students.id }).from(students).where(and(ne(students.handleStatus, "VALID")))).map((s) => s.id);
  if (parsed.data.studentIds?.length) {
    const found = await db.select({ id: students.id }).from(students).where(inArray(students.id, ids));
    if (found.length === 0) return jsonError(404, "NOT_FOUND", "No matching students");
  }

  try {
    const r = await withLock((lock) => verifyHandles(ids, { trigger: "MANUAL", triggeredBy: auth.adminId, renew: lock.renew }));
    return NextResponse.json({ checked: ids.length, valid: r.valid, invalid: r.invalid, renamed: r.renamed, warnings: r.warnings });
  } catch (err) {
    return syncErrorResponse(err);
  }
}
