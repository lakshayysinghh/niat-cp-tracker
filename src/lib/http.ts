import { NextResponse } from "next/server";

/** One error shape for every API route: { error, code, details? } (Section 9). */
export function jsonError(
  status: number,
  code: string,
  error: string,
  extra: { details?: unknown; headers?: HeadersInit; [key: string]: unknown } = {},
): NextResponse {
  const { headers, ...body } = extra;
  return NextResponse.json({ error, code, ...body }, { status, headers });
}

/** Only same-site relative paths; anything else falls back to "/". Prevents open redirects. */
export function safeNextPath(next: unknown): string {
  if (typeof next !== "string" || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login") || next.startsWith("/api/")) return "/";
  return next;
}
