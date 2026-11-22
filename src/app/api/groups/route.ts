import { and, asc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { linkedGroups } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { parseGroupCode } from "@/lib/cf/parse-url";
import { jsonError } from "@/lib/http";
import { isUniqueViolation } from "@/lib/sync/respond";
import { getDefaultBatchId } from "@/lib/sync/runs";

/** GET /api/groups (admin) -> { groups } */
export async function GET() {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const batchId = await getDefaultBatchId();
  const groups = await db.select().from(linkedGroups).where(eq(linkedGroups.batchId, batchId)).orderBy(asc(linkedGroups.createdAt));
  return NextResponse.json({ groups });
}

/** POST /api/groups { groupCode (code or link), autoDiscover? } (admin) -> 201 { group } */
export async function POST(request: Request) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const parsed = z
    .object({ groupCode: z.string().max(300), autoDiscover: z.boolean().default(true) })
    .safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send { groupCode }");
  const groupCode = parseGroupCode(parsed.data.groupCode);
  if (!groupCode) {
    return jsonError(400, "INVALID_GROUP", "Paste a group code like vP4zGe21UV or a link like https://codeforces.com/group/vP4zGe21UV");
  }

  try {
    const [group] = await db
      .insert(linkedGroups)
      .values({ batchId: await getDefaultBatchId(), groupCode, autoDiscover: parsed.data.autoDiscover })
      .returning();
    return NextResponse.json({ group }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "ALREADY_LINKED", `Group ${groupCode} is already linked`);
    throw err;
  }
}

/** PATCH /api/groups { groupCode, autoDiscover } (admin) -> 200 { group } */
export async function PATCH(request: Request) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const parsed = z.object({ groupCode: z.string().max(32), autoDiscover: z.boolean() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send { groupCode, autoDiscover }");
  const [group] = await db
    .update(linkedGroups)
    .set({ autoDiscover: parsed.data.autoDiscover })
    .where(and(eq(linkedGroups.batchId, await getDefaultBatchId()), eq(linkedGroups.groupCode, parsed.data.groupCode)))
    .returning();
  if (!group) return jsonError(404, "NOT_FOUND", "Group not linked");
  return NextResponse.json({ group });
}

/** DELETE /api/groups { groupCode } (admin) -> 200. Contests already tracked stay. */
export async function DELETE(request: Request) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const parsed = z.object({ groupCode: z.string().max(32) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send { groupCode }");
  const deleted = await db
    .delete(linkedGroups)
    .where(and(eq(linkedGroups.batchId, await getDefaultBatchId()), eq(linkedGroups.groupCode, parsed.data.groupCode)))
    .returning();
  if (deleted.length === 0) return jsonError(404, "NOT_FOUND", "Group not linked");
  return NextResponse.json({ deleted: true });
}
