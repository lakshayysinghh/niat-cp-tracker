import bcrypt from "bcryptjs";
import { asc } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { isUniqueViolation } from "@/lib/sync/respond";

const publicFields = {
  id: admins.id,
  email: admins.email,
  name: admins.name,
  role: admins.role,
  lastLoginAt: admins.lastLoginAt,
  createdAt: admins.createdAt,
};

/** GET /api/admins (admin) -> { admins } */
export async function GET() {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  return NextResponse.json({ admins: await db.select(publicFields).from(admins).orderBy(asc(admins.createdAt)) });
}

const body = z.object({
  email: z.email().max(320),
  name: z.string().trim().min(1).max(120),
  tempPassword: z.string().max(200),
  role: z.enum(["admin", "instructor"]).default("admin"),
});

/** POST /api/admins { email, name, tempPassword, role } (admin) -> 201 { admin } */
export async function POST(request: Request) {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send a valid email, a name, a temporary password and a role");
  const { email, name, tempPassword, role } = parsed.data;
  if (tempPassword.length < 10) return jsonError(400, "WEAK_PASSWORD", "Temporary password must be at least 10 characters");

  try {
    const [admin] = await db
      .insert(admins)
      .values({ email: email.trim().toLowerCase(), name, role, passwordHash: await bcrypt.hash(tempPassword, 12) })
      .returning(publicFields);
    return NextResponse.json({ admin }, { status: 201 });
  } catch (err) {
    if (isUniqueViolation(err)) return jsonError(409, "DUPLICATE_EMAIL", "An admin with this email already exists");
    throw err;
  }
}
