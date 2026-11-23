import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { credentialDiagnostics, getCfClient, mapCfError } from "@/lib/cf/client";
import { jsonError } from "@/lib/http";
import { withLock } from "@/lib/sync/lock";
import { syncErrorResponse } from "@/lib/sync/respond";

/**
 * POST /api/settings/cf-check (admin): one signed user.info call.
 * -> { ok, keyHandle, latencyMs, diagnostics } or the mapped error + diagnostics.
 * Diagnostics never include the secret: key prefix, lengths, an 8-hex SHA-256 fingerprint
 * of the secret, paste problems, and this server's clock offset from Codeforces.
 */
export async function POST() {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const keyHandle = process.env.CF_KEY_HANDLE?.trim() || "tourist";
  const creds = await credentialDiagnostics();
  try {
    return await withLock(async () => {
      const t0 = Date.now();
      const { envelope, serverDate } = await getCfClient().request("user.info", { handles: keyHandle });
      const latencyMs = Date.now() - t0;
      const cfTime = serverDate ? Date.parse(serverDate) : NaN;
      const clockOffsetSeconds = Number.isNaN(cfTime) ? null : Math.round((t0 + latencyMs / 2 - cfTime) / 1000);
      const diagnostics = { ...creds, clockOffsetSeconds, serverTime: new Date(t0).toISOString() };
      if (envelope.status === "FAILED") {
        const err = mapCfError("user.info", envelope.comment, { keyHandle });
        return jsonError(502, err.code, err.message, { latencyMs, diagnostics });
      }
      return NextResponse.json({ ok: true, keyHandle, latencyMs, diagnostics });
    });
  } catch (err) {
    return syncErrorResponse(err);
  }
}
