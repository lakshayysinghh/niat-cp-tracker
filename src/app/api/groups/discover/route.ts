import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { discoverContests } from "@/lib/sync/discovery";
import { syncErrorResponse } from "@/lib/sync/respond";

/**
 * POST /api/groups/discover (admin): run linked-group discovery now.
 * -> { groups, added, errors }. New contests sync on Refresh or the next scheduled run.
 */
export async function POST() {
  const auth = await requireApiSession("admin");
  if (auth instanceof Response) return auth;
  try {
    return NextResponse.json(await discoverContests({ trigger: "MANUAL", triggeredBy: auth.adminId }));
  } catch (err) {
    return syncErrorResponse(err);
  }
}
