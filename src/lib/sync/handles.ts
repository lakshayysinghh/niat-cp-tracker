import "server-only";
import { inArray } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { students } from "@/db/schema";
import { CfHandleNotFoundError, CfSchemaError, getCfClient, mapCfError } from "@/lib/cf/client";
import { cfUserInfoResult } from "@/lib/cf/schemas";
import { finishRun, startRun, type RunContext } from "./runs";

/**
 * verifyHandles() (IMPLEMENTATION_PLAN.md, Section 7). One unknown handle fails the
 * whole user.info call, so: call, remove the handle Codeforces names as not found
 * (marking it INVALID), call again — at most 20 removals per chunk of 100.
 * Callers must hold the Codeforces lock (withLock).
 */

export const CHUNK = 100;
export const MAX_REMOVALS_PER_CHUNK = 20;

export interface VerifyResult {
  valid: number;
  invalid: string[];
  renamed: Array<{ from: string; to: string }>;
  warnings: string[];
  cfCalls: number;
}

interface Pending {
  id: string;
  cfHandle: string;
  handleLower: string;
}

export async function verifyHandles(
  studentIds: readonly string[],
  ctx: RunContext & { renew?: () => Promise<unknown> },
): Promise<VerifyResult> {
  const result: VerifyResult = { valid: 0, invalid: [], renamed: [], warnings: [], cfCalls: 0 };
  if (studentIds.length === 0) return result;

  const rows: Pending[] = await db
    .select({ id: students.id, cfHandle: students.cfHandle, handleLower: students.handleLower })
    .from(students)
    .where(inArray(students.id, [...studentIds]));
  if (rows.length === 0) return result;

  const cf = getCfClient();
  const calls0 = cf.callCount();
  const runId = await startRun("HANDLES", ctx);

  try {
    for (let start = 0; start < rows.length; start += CHUNK) {
      await ctx.renew?.();
      const pending = rows.slice(start, start + CHUNK);
      const now = new Date();
      const updates: BatchItem<"pg">[] = [];
      let removals = 0;

      // Remove not-found handles one at a time until the call passes.
      let users: ReturnType<typeof cfUserInfoResult.parse> | undefined;
      while (pending.length > 0) {
        const { envelope } = await cf.request("user.info", {
          handles: pending.map((p) => p.cfHandle).join(";"),
          checkHistoricHandles: true,
        });
        if (envelope.status === "OK") {
          const parsed = cfUserInfoResult.safeParse(envelope.result);
          if (!parsed.success) throw new CfSchemaError("user.info", parsed.error.issues[0]?.path.join(".") ?? "", parsed.error.issues[0]?.message ?? "");
          users = parsed.data;
          break;
        }
        const err = mapCfError("user.info", envelope.comment);
        if (!(err instanceof CfHandleNotFoundError)) throw err;
        const i = pending.findIndex((p) => p.handleLower === err.handle.toLowerCase());
        if (i === -1) throw err; // Codeforces named a handle we did not send
        const [bad] = pending.splice(i, 1);
        result.invalid.push(bad.cfHandle);
        updates.push(db.update(students).set({ handleStatus: "INVALID", handleCheckedAt: now }).where(inArray(students.id, [bad.id])));
        if (++removals > MAX_REMOVALS_PER_CHUNK) {
          throw new Error(`More than ${MAX_REMOVALS_PER_CHUNK} unknown handles in one chunk of ${CHUNK}; fix the roster and verify again`);
        }
        await ctx.renew?.();
      }

      if (users) {
        if (users.length !== pending.length) {
          throw new CfSchemaError("user.info", "", `expected ${pending.length} users in request order, got ${users.length}`);
        }
        // A rename may collide with another student's current handle: leave that row unchanged.
        const renamedLowers = users.map((u, i) => [u.handle.toLowerCase(), pending[i]] as const).filter(([l, p]) => l !== p.handleLower);
        const owners = renamedLowers.length
          ? await db
              .select({ id: students.id, handleLower: students.handleLower })
              .from(students)
              .where(inArray(students.handleLower, renamedLowers.map(([l]) => l)))
          : [];
        const ownerOf = new Map(owners.map((o) => [o.handleLower, o.id]));

        users.forEach((u, i) => {
          const s = pending[i];
          const lower = u.handle.toLowerCase();
          const owner = ownerOf.get(lower);
          if (lower !== s.handleLower && owner && owner !== s.id) {
            result.warnings.push(`${s.cfHandle} is now ${u.handle}, which another student already uses; left unchanged`);
            return;
          }
          if (lower !== s.handleLower) result.renamed.push({ from: s.cfHandle, to: u.handle });
          result.valid++;
          updates.push(
            db
              .update(students)
              .set({
                cfHandle: u.handle,
                handleLower: lower,
                handleStatus: "VALID",
                handleCheckedAt: now,
                cfRating: u.rating ?? null,
                cfMaxRating: u.maxRating ?? null,
                cfRank: u.rank ?? null,
                cfLastOnlineAt: u.lastOnlineTimeSeconds ? new Date(u.lastOnlineTimeSeconds * 1000) : null,
              })
              .where(inArray(students.id, [s.id])),
          );
        });
      }

      if (updates.length) await db.batch(updates as [BatchItem<"pg">, ...BatchItem<"pg">[]]);
    }

    result.cfCalls = cf.callCount() - calls0;
    await finishRun(runId, true, result.cfCalls, result.warnings.length ? `warning: ${result.warnings.join("; ")}` : null);
    return result;
  } catch (err) {
    result.cfCalls = cf.callCount() - calls0;
    await finishRun(runId, false, result.cfCalls, err instanceof Error ? err.message : String(err)).catch(() => undefined);
    throw err;
  }
}
