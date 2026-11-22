import "server-only";
import type { NextResponse } from "next/server";
import { CfError } from "@/lib/cf/client";
import { jsonError } from "@/lib/http";
import { ContestNotFoundError } from "./contest";
import { LockBusyError } from "./lock";

/** Map sync/Codeforces errors to the API's { error, code } shape. */
export function syncErrorResponse(err: unknown): NextResponse {
  if (err instanceof LockBusyError) return jsonError(409, err.code, err.message);
  if (err instanceof ContestNotFoundError) return jsonError(404, "NOT_FOUND", err.message);
  if (err instanceof CfError) {
    const status = err.code === "CF_RATE_LIMIT" ? 503 : 502;
    return jsonError(status, err.code, err.message);
  }
  console.error(err);
  return jsonError(500, "INTERNAL", err instanceof Error ? err.message : "Unexpected error");
}

/** Postgres unique violation (23505), possibly wrapped by the driver. */
export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}
