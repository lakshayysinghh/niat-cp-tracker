import { and, count, eq, ne } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

/** DELETE /api/admins/[id] (admin) -> 200; 400 for yourself or the last admin */
export async function DELETE(_request: Request, ctx: RouteContext<"/api/admins/[id]">) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const { id } = await ctx.params;
  if (!z.uuid().safeParse(id).success) return jsonError(404, "NOT_FOUND", "Admin not found");
  if (id === auth.adminId) return jsonError(400, "CANNOT_REMOVE_SELF", "You cannot remove yourself");

  const [target] = await db.select({ role: admins.role }).from(admins).where(eq(admins.id, id));
  if (!target) return jsonError(404, "NOT_FOUND", "Admin not found");
  if (target.role === "admin") {
    const [{ n }] = await db.select({ n: count() }).from(admins).where(and(eq(admins.role, "admin"), ne(admins.id, id)));
    if (n === 0) return jsonError(400, "LAST_ADMIN", "You cannot remove the last admin");
  }
  await db.delete(admins).where(eq(admins.id, id));
  return NextResponse.json({ deleted: true });
}
