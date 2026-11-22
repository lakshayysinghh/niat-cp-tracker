import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { batches, syncRuns } from "@/db/schema";

type SyncKind = (typeof syncRuns.$inferInsert)["kind"];
type SyncTrigger = (typeof syncRuns.$inferInsert)["trigger"];

export interface RunContext {
  trigger: SyncTrigger;
  triggeredBy?: string | null;
}

export async function startRun(kind: SyncKind, ctx: RunContext, contestId?: string | null): Promise<string> {
  const [row] = await db
    .insert(syncRuns)
    .values({ kind, trigger: ctx.trigger, triggeredBy: ctx.triggeredBy ?? null, contestId: contestId ?? null })
    .returning({ id: syncRuns.id });
  return row.id;
}

export function finishRunQuery(id: string, ok: boolean, cfCalls: number, error: string | null) {
  return db.update(syncRuns).set({ finishedAt: new Date(), ok, cfCalls, error: error?.slice(0, 4000) ?? null }).where(eq(syncRuns.id, id));
}

export async function finishRun(id: string, ok: boolean, cfCalls: number, error: string | null): Promise<void> {
  await finishRunQuery(id, ok, cfCalls, error);
}

/** The single batch for now ("Batch 1"); no switcher UI yet (Section 3, rule 7). */
export async function getDefaultBatchId(): Promise<string> {
  const [row] = await db.select({ id: batches.id }).from(batches).orderBy(asc(batches.createdAt)).limit(1);
  if (!row) throw new Error("No batch found. Run `npm run seed` first.");
  return row.id;
}
