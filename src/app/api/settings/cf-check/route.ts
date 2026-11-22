import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { getCfClient, mapCfError } from "@/lib/cf/client";
import { jsonError } from "@/lib/http";
import { withLock } from "@/lib/sync/lock";
import { syncErrorResponse } from "@/lib/sync/respond";

/** POST /api/settings/cf-check (admin): one signed user.info call -> { ok, keyHandle, latencyMs } */
export async function POST() {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  const keyHandle = process.env.CF_KEY_HANDLE ?? "tourist";
  try {
    return await withLock(async () => {
      const t0 = Date.now();
      const { envelope } = await getCfClient().request("user.info", { handles: keyHandle });
      const latencyMs = Date.now() - t0;
      if (envelope.status === "FAILED") {
        const err = mapCfError("user.info", envelope.comment, { keyHandle });
        return jsonError(502, err.code, err.message, { latencyMs });
      }
      return NextResponse.json({ ok: true, keyHandle, latencyMs });
    });
  } catch (err) {
    return syncErrorResponse(err);
  }
}
