import { NextResponse } from "next/server";
import { z } from "zod";
import { attemptLogin, createSession, LOCK_MINUTES } from "@/lib/auth";
import { jsonError } from "@/lib/http";

const body = z.object({
  email: z.string().trim().min(1).max(320),
  password: z.string().min(1).max(200),
});

/** POST /api/auth/login — public. 200 { admin } | 401 generic | 429 while locked. */
export async function POST(request: Request) {
  let input: z.infer<typeof body>;
  try {
    input = body.parse(await request.json());
  } catch {
    return jsonError(400, "BAD_REQUEST", "Email and password are required");
  }

  const result = await attemptLogin(input.email, input.password);

  if (!result.ok) {
    if (result.reason === "LOCKED") {
      const minutes = Math.ceil(result.retryAfterSeconds / 60);
      return jsonError(
        429,
        "LOCKED",
        `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? "" : "s"}.`,
        { retryAfterSeconds: result.retryAfterSeconds, headers: { "Retry-After": String(result.retryAfterSeconds) } },
      );
    }
    return jsonError(401, "INVALID_CREDENTIALS", "Invalid email or password", {
      details: { lockAfter: `5 failed attempts lock the account for ${LOCK_MINUTES} minutes` },
    });
  }

  await createSession({ id: result.admin.adminId, role: result.admin.role });
  const { adminId, email, name, role } = result.admin;
  return NextResponse.json({ admin: { id: adminId, email, name, role } });
}
