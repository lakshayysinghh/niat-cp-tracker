import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().max(200) });

/** POST /api/me/password { currentPassword, newPassword (10+ chars) } -> 200 { ok: true } */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send currentPassword and newPassword");
  const { currentPassword, newPassword } = parsed.data;
  if (newPassword.length < 10) return jsonError(400, "WEAK_PASSWORD", "New password must be at least 10 characters");
  if (newPassword === currentPassword) return jsonError(400, "SAME_PASSWORD", "New password must differ from the current one");

  const [me] = await db.select({ passwordHash: admins.passwordHash }).from(admins).where(eq(admins.id, auth.adminId));
  if (!me || !(await bcrypt.compare(currentPassword, me.passwordHash))) {
    return jsonError(400, "WRONG_PASSWORD", "Current password is incorrect");
  }
  await db.update(admins).set({ passwordHash: await bcrypt.hash(newPassword, 12) }).where(eq(admins.id, auth.adminId));
  return NextResponse.json({ ok: true });
}
