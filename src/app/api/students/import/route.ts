import { NextResponse } from "next/server";
import { z } from "zod";
import { requireApiSession } from "@/lib/auth";
import { MAX_ROWS, parseCsvText, rowsFromObjects } from "@/lib/csv";
import { jsonError } from "@/lib/http";
import { commitImport, planImport } from "@/lib/students";
import { isUniqueViolation } from "@/lib/sync/respond";

const body = z.union([
  z.object({ csv: z.string().max(1_100_000), dryRun: z.boolean().default(true) }),
  z.object({ rows: z.array(z.record(z.string(), z.unknown())).max(MAX_ROWS), dryRun: z.boolean().default(true) }),
]);

/**
 * POST /api/students/import { csv } | { rows }, dryRun (default true).
 * Dry run: 200 { preview, failed } and writes nothing.
 * Commit:  200 { inserted, updated, unchanged, failed, verification }.
 */
export async function POST(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;

  const parsedBody = body.safeParse(await request.json().catch(() => null));
  if (!parsedBody.success) return jsonError(400, "BAD_REQUEST", "Send { csv: string } or { rows: [...] }, plus dryRun");
  const input = parsedBody.data;

  const parsed = "csv" in input ? parseCsvText(input.csv) : rowsFromObjects(input.rows);
  if (!parsed.ok) return jsonError(400, "INVALID_FILE", parsed.error);

  const plan = await planImport(parsed.rows);
  if (input.dryRun) return NextResponse.json({ dryRun: true, preview: plan.preview, failed: plan.failed });

  try {
    return NextResponse.json({ dryRun: false, ...(await commitImport(plan, auth.adminId)) });
  } catch (err) {
    if (isUniqueViolation(err)) {
      return jsonError(409, "CONFLICT", "Two rows conflict with existing students (for example, swapped handles). Nothing was written; fix the file and try again.");
    }
    throw err;
  }
}
