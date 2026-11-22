import "server-only";
import { and, eq, inArray, ne } from "drizzle-orm";
import type { BatchItem } from "drizzle-orm/batch";
import { db } from "@/db";
import { students, type Student } from "@/db/schema";
import { cleanRows, cleanStudent, normalizeHandle, normalizeNiatId, type CleanRow, type RawRow, type RowFailure } from "@/lib/csv";
import { normalizePhone } from "@/lib/phone";
import { verifyHandles, type VerifyResult } from "@/lib/sync/handles";
import { withLock } from "@/lib/sync/lock";
import { getDefaultBatchId } from "@/lib/sync/runs";

/**
 * Roster writes (IMPLEMENTATION_PLAN.md, Section 7). Import only adds and updates;
 * students missing from a file are never deleted.
 */

export interface Verification {
  valid: number;
  invalid: string[];
  renamed: Array<{ from: string; to: string }>;
  warnings: string[];
  /** Set when verification could not run (lock busy, Codeforces down); handles stay UNVERIFIED. */
  error?: string;
}

/** Verify under the Codeforces lock. Never throws: errors are reported in `error`. */
export async function runVerification(ids: readonly string[], triggeredBy: string | null): Promise<Verification> {
  if (ids.length === 0) return { valid: 0, invalid: [], renamed: [], warnings: [] };
  try {
    const r: VerifyResult = await withLock((lock) => verifyHandles(ids, { trigger: "MANUAL", triggeredBy, renew: lock.renew }));
    return { valid: r.valid, invalid: r.invalid, renamed: r.renamed, warnings: r.warnings };
  } catch (err) {
    return { valid: 0, invalid: [], renamed: [], warnings: [], error: err instanceof Error ? err.message : String(err) };
  }
}

export class StudentConflictError extends Error {
  readonly status = 409;
  constructor(
    readonly code: "DUPLICATE_NIAT_ID" | "DUPLICATE_HANDLE",
    message: string,
  ) {
    super(message);
  }
}

export class StudentInputError extends Error {
  readonly status = 400;
  readonly code = "INVALID_INPUT";
}

// ---------------------------------------------------------------- single student

export async function createStudent(input: Record<string, unknown>, adminId: string) {
  const c = cleanStudent(input);
  if (!c.ok) throw new StudentInputError(c.reason);
  const v = c.value;

  const [byNiat] = await db.select({ id: students.id }).from(students).where(eq(students.niatId, v.niatId));
  if (byNiat) throw new StudentConflictError("DUPLICATE_NIAT_ID", `NIAT ID ${v.niatId} already exists`);
  const [byHandle] = await db.select({ niatId: students.niatId }).from(students).where(eq(students.handleLower, v.handleLower));
  if (byHandle) throw new StudentConflictError("DUPLICATE_HANDLE", `Handle ${v.cfHandle} already belongs to ${byHandle.niatId}`);

  const batchId = await getDefaultBatchId();
  const [created] = await db
    .insert(students)
    .values({ batchId, niatId: v.niatId, name: v.name, college: v.college, phone: v.phone, enteredHandle: v.enteredHandle, cfHandle: v.cfHandle, handleLower: v.handleLower })
    .returning({ id: students.id });

  const verification = await runVerification([created.id], adminId);
  const [student] = await db.select().from(students).where(eq(students.id, created.id));
  return { student, verification };
}

export async function updateStudent(id: string, patch: Record<string, unknown>, adminId: string) {
  const [current] = await db.select().from(students).where(eq(students.id, id));
  if (!current) return null;

  const set: Partial<typeof students.$inferInsert> = {};
  if (patch.phone !== undefined) {
    const p = normalizePhone(String(patch.phone ?? ""));
    if (!p.ok) throw new StudentInputError(p.error);
    set.phone = p.phone;
  }
  if (patch.name !== undefined) {
    const name = String(patch.name ?? "").trim();
    set.name = name ? name.slice(0, 200) : null;
  }
  if (patch.college !== undefined) {
    const college = String(patch.college ?? "").trim();
    set.college = college ? college.slice(0, 200) : null;
  }
  if (patch.niatId !== undefined) {
    const n = normalizeNiatId(String(patch.niatId ?? ""));
    if (!n.ok) throw new StudentInputError(n.error);
    if (n.niatId !== current.niatId) {
      const [taken] = await db.select({ id: students.id }).from(students).where(eq(students.niatId, n.niatId));
      if (taken) throw new StudentConflictError("DUPLICATE_NIAT_ID", `NIAT ID ${n.niatId} already exists`);
      set.niatId = n.niatId;
    }
  }
  let handleChanged = false;
  if (patch.cfHandle !== undefined) {
    const entered = String(patch.cfHandle ?? "").trim();
    const h = normalizeHandle(entered);
    if (!h.ok) throw new StudentInputError(h.error);
    const lower = h.handle.toLowerCase();
    if (lower !== current.handleLower) {
      const [owner] = await db
        .select({ niatId: students.niatId })
        .from(students)
        .where(and(eq(students.handleLower, lower), ne(students.id, id)));
      if (owner) throw new StudentConflictError("DUPLICATE_HANDLE", `Handle ${h.handle} already belongs to ${owner.niatId}`);
      Object.assign(set, resetHandle(entered, h.handle));
      handleChanged = true;
    } else {
      set.enteredHandle = entered;
    }
  }

  if (Object.keys(set).length) await db.update(students).set(set).where(eq(students.id, id));
  const verification = handleChanged ? await runVerification([id], adminId) : undefined;
  const [student] = await db.select().from(students).where(eq(students.id, id));
  return { student, verification };
}

function resetHandle(enteredHandle: string, cfHandle: string): Partial<typeof students.$inferInsert> {
  return {
    enteredHandle,
    cfHandle,
    handleLower: cfHandle.toLowerCase(),
    handleStatus: "UNVERIFIED",
    handleCheckedAt: null,
    cfRating: null,
    cfMaxRating: null,
    cfRank: null,
    cfLastOnlineAt: null,
  };
}

// ---------------------------------------------------------------- import

export type ImportAction = "insert" | "update" | "unchanged";

export interface PreviewRow extends CleanRow {
  action: ImportAction;
  handleChanged: boolean;
}

export interface ImportPlan {
  preview: PreviewRow[];
  failed: RowFailure[];
}

/** Read-only: clean the rows and check them against the database. Shared by dry run and commit. */
export async function planImport(rows: readonly RawRow[]): Promise<ImportPlan> {
  const { valid, failed } = cleanRows(rows);
  if (valid.length === 0) return { preview: [], failed };

  const existing = await db.select().from(students).where(inArray(students.niatId, valid.map((r) => r.niatId)));
  const byNiat = new Map(existing.map((s) => [s.niatId, s]));
  const owners = await db
    .select({ niatId: students.niatId, handleLower: students.handleLower })
    .from(students)
    .where(inArray(students.handleLower, valid.map((r) => r.handleLower)));
  const ownerOf = new Map(owners.map((o) => [o.handleLower, o.niatId]));

  const preview: PreviewRow[] = [];
  for (const r of valid) {
    const owner = ownerOf.get(r.handleLower);
    if (owner && owner !== r.niatId) {
      failed.push({ row: r.row, niatId: r.niatId, reason: `Handle ${r.cfHandle} already belongs to ${owner}` });
      continue;
    }
    const cur = byNiat.get(r.niatId);
    if (!cur) {
      preview.push({ ...r, action: "insert", handleChanged: false });
      continue;
    }
    const enteredLower = normalizeHandle(cur.enteredHandle);
    const sameHandle = r.handleLower === cur.handleLower || (enteredLower.ok && enteredLower.handle.toLowerCase() === r.handleLower);
    const same = sameHandle && cur.phone === r.phone && (cur.name ?? null) === r.name && (cur.college ?? null) === r.college && cur.enteredHandle === r.enteredHandle;
    preview.push({ ...r, action: same ? "unchanged" : "update", handleChanged: !sameHandle });
  }
  failed.sort((a, b) => a.row - b.row);
  return { preview, failed };
}

export async function commitImport(plan: ImportPlan, adminId: string) {
  const batchId = await getDefaultBatchId();
  const inserts = plan.preview.filter((r) => r.action === "insert");
  const updates = plan.preview.filter((r) => r.action === "update");

  const statements: BatchItem<"pg">[] = [];
  for (let i = 0; i < inserts.length; i += 500) {
    statements.push(
      db.insert(students).values(
        inserts.slice(i, i + 500).map((r) => ({
          batchId,
          niatId: r.niatId,
          name: r.name,
          college: r.college,
          phone: r.phone,
          enteredHandle: r.enteredHandle,
          cfHandle: r.cfHandle,
          handleLower: r.handleLower,
        })),
      ),
    );
  }
  for (const r of updates) {
    const set: Partial<typeof students.$inferInsert> = r.handleChanged
      ? { phone: r.phone, name: r.name, college: r.college, ...resetHandle(r.enteredHandle, r.cfHandle) }
      : { phone: r.phone, name: r.name, college: r.college, enteredHandle: r.enteredHandle };
    statements.push(db.update(students).set(set).where(eq(students.niatId, r.niatId)));
  }
  if (statements.length) await db.batch(statements as [BatchItem<"pg">, ...BatchItem<"pg">[]]);

  // Verify new or changed handles before responding.
  const toVerify = [...inserts, ...updates.filter((r) => r.handleChanged)].map((r) => r.niatId);
  const ids = toVerify.length
    ? (await db.select({ id: students.id }).from(students).where(inArray(students.niatId, toVerify))).map((s) => s.id)
    : [];
  const verification = await runVerification(ids, adminId);

  return { inserted: inserts.length, updated: updates.length, unchanged: plan.preview.length - inserts.length - updates.length, failed: plan.failed, verification };
}

export type { Student };
