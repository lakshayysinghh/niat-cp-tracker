import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { contests } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const uuid = z.uuid();
const body = z.object({ accessMode: z.enum(["AUTO", "MANAGER", "MEMBER"]) });

/** PATCH /api/contests/[id] { accessMode } -> 200 { contest }. Changing the mode forgets the resolved mode. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/contests/[id]">) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Contest not found");

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "accessMode must be AUTO, MANAGER or MEMBER");

  const [contest] = await db
    .update(contests)
    .set({ accessMode: parsed.data.accessMode, resolvedMode: null })
    .where(eq(contests.id, id))
    .returning();
  if (!contest) return jsonError(404, "NOT_FOUND", "Contest not found");
  return NextResponse.json({ contest });
}

/** DELETE /api/contests/[id] (admin) -> 200 { deleted: true }; cascades to problems, cells and participations. */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/contests/[id]">) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!uuid.safeParse(id).success) return jsonError(404, "NOT_FOUND", "Contest not found");

  const deleted = await db.delete(contests).where(eq(contests.id, id)).returning({ id: contests.id });
  if (deleted.length === 0) return jsonError(404, "NOT_FOUND", "Contest not found");
  return NextResponse.json({ deleted: true });
}
