import { NextResponse } from "next/server";
import { clearSession, requireApiSession } from "@/lib/auth";

/** POST /api/auth/logout — session. Always clears the cookie; 401 if there was no session. */
export async function POST() {
  const auth = await requireApiSession();
  await clearSession();
  if (auth instanceof Response) return auth;
  return NextResponse.json({ ok: true });
}
