import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { cfCall } from "@/lib/cf/client";
import { parseGroupCode } from "@/lib/cf/parse-url";
import { cfContestListResult } from "@/lib/cf/schemas";
import { jsonError } from "@/lib/http";
import { withLock } from "@/lib/sync/lock";
import { syncErrorResponse } from "@/lib/sync/respond";

/**
 * GET /api/homework/group-contests?groupCode=MWSDmqGsZm
 * -> { groupCode, contests: [{ cfContestId, name, url }] } for linking homework columns.
 * contest.list works for any visible group, even where the key cannot read standings.
 */
export async function GET(request: Request) {
  const auth = await requireApiSession();
  if (auth instanceof Response) return auth;
  const groupCode = parseGroupCode(new URL(request.url).searchParams.get("groupCode"));
  if (!groupCode) return jsonError(400, "INVALID_GROUP", "Send ?groupCode= a code like MWSDmqGsZm or a group link");

  try {
    const list = await withLock(() => cfCall("contest.list", { gym: true, groupCode }, cfContestListResult, { groupCode }));
    const contests = list
      .sort((a, b) => (a.startTimeSeconds ?? 0) - (b.startTimeSeconds ?? 0))
      .map((c) => ({ cfContestId: c.id, name: c.name, url: `https://codeforces.com/group/${groupCode}/contest/${c.id}` }));
    return NextResponse.json({ groupCode, contests });
  } catch (err) {
    return syncErrorResponse(err);
  }
}
