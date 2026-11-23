import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { commitHomeworkImport, planHomeworkImport } from "@/lib/homework";
import { jsonError } from "@/lib/http";

const body = z.object({ csv: z.string().max(2_100_000), dryRun: z.boolean().default(true) });

/**
 * POST /api/homework/import { csv, dryRun (default true) }
 * Dry run: 200 { preview } and writes nothing. Commit: 200 { preview, result }.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;

  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send { csv: string, dryRun }");

  const plan = await planHomeworkImport(parsed.data.csv);
  if (!plan.ok) return jsonError(400, "INVALID_FILE", plan.error);
  if (parsed.data.dryRun) return NextResponse.json({ dryRun: true, preview: plan.preview });
  if (plan.preview.matched.length === 0) return jsonError(400, "NO_MATCHES", "No row matched a student on the roster, so nothing was imported");

  const result = await commitHomeworkImport(plan, auth.adminId);
  return NextResponse.json({ dryRun: false, preview: plan.preview, result });
}
