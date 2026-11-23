import { and, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { homeworkColumns } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { parseGroupCode } from "@/lib/cf/parse-url";
import { jsonError } from "@/lib/http";

const uuid = z.uuid();
const body = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  problemCount: z.number().int().min(1).max(200).optional(),
  /** Codeforces link: group code (or any group URL) + contest id; both null to unlink */
  groupCode: z.string().max(300).nullable().optional(),
  cfContestId: z.number().int().positive().nullable().optional(),
});

/** PATCH /api/homework/columns/[id] { title?, problemCount?, groupCode?, cfContestId? } -> { column } */
export async function PATCH(request: Request, ctx: RouteContext<"/api/homework/columns/[id]">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Column not found");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send title, problemCount, groupCode or cfContestId");
  const p = parsed.data;

  const [current] = await db.select().from(homeworkColumns).where(eq(homeworkColumns.id, id));
  if (!current) return jsonError(404, "NOT_FOUND", "Column not found");

  const set: Partial<typeof homeworkColumns.$inferInsert> = {};
  if (p.title !== undefined && p.title !== current.title) {
    const [clash] = await db
      .select({ id: homeworkColumns.id })
      .from(homeworkColumns)
      .where(and(eq(homeworkColumns.batchId, current.batchId), eq(homeworkColumns.title, p.title), ne(homeworkColumns.id, id)));
    if (clash) return jsonError(409, "DUPLICATE_TITLE", `Another column is already called “${p.title}”`);
    set.title = p.title;
  }
  if (p.problemCount !== undefined) set.problemCount = p.problemCount;
  if (p.groupCode !== undefined) {
    if (p.groupCode === null || p.groupCode.trim() === "") set.groupCode = null;
    else {
      const code = parseGroupCode(p.groupCode);
      if (!code) return jsonError(400, "INVALID_GROUP", "Group must be a code like MWSDmqGsZm or a group link");
      set.groupCode = code;
    }
  }
  if (p.cfContestId !== undefined) set.cfContestId = p.cfContestId;

  const [column] = Object.keys(set).length ? await db.update(homeworkColumns).set(set).where(eq(homeworkColumns.id, id)).returning() : [current];
  return NextResponse.json({ column });
}

/** DELETE /api/homework/columns/[id] (admin) -> 200; removes the column and its scores. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/homework/columns/[id]">) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Column not found");
  const deleted = await db.delete(homeworkColumns).where(eq(homeworkColumns.id, id)).returning({ id: homeworkColumns.id });
  if (deleted.length === 0) return jsonError(404, "NOT_FOUND", "Column not found");
  return NextResponse.json({ deleted: true });
}
