import { and, eq, inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { homeworkColumns } from "@/db/schema";
import { requireApiSession } from "@/lib/auth";
import { jsonError } from "@/lib/http";
import { getDefaultBatchId } from "@/lib/sync/runs";

const body = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

/** PATCH /api/homework/reorder { ids: [columnId in display order] } -> { ok } */
export async function PATCH(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonError(400, "BAD_REQUEST", "Send { ids: [...] } in the new order");
  const { ids } = parsed.data;
  if (new Set(ids).size !== ids.length) return jsonError(400, "BAD_REQUEST", "Duplicate column ids");

  const batchId = await getDefaultBatchId();
  const found = await db
    .select({ id: homeworkColumns.id })
    .from(homeworkColumns)
    .where(and(eq(homeworkColumns.batchId, batchId), inArray(homeworkColumns.id, ids)));
  if (found.length !== ids.length) return jsonError(400, "UNKNOWN_COLUMN", "Some columns do not exist");

  const updates: BatchItem<"pg">[] = ids.map((id, i) => db.update(homeworkColumns).set({ sortOrder: i }).where(eq(homeworkColumns.id, id)));
  await db.batch(updates as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
  return NextResponse.json({ ok: true });
}
