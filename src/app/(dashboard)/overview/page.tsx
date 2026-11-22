import { ComingSoon } from "@/components/coming-soon";
import { verifySession } from "@/lib/auth";

export default async function OverviewPage() {
  await verifySession();
  return (
    <ComingSoon title="Batch overview">
      Attendance trend, the at-risk list and the leaderboard arrive in Phase 3.
    </ComingSoon>
  );
}
