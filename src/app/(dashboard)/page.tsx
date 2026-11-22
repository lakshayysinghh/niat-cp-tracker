import { ComingSoon } from "@/components/coming-soon";
import { verifySession } from "@/lib/auth";

export default async function ContestsPage() {
  await verifySession();
  return (
    <ComingSoon title="Contests">
      No contests yet. The Add Contest bar and contest list arrive in Phase 3; contest sync is built in Phase 2.
    </ComingSoon>
  );
}
