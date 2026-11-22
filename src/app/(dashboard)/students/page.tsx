import { ComingSoon } from "@/components/coming-soon";
import { verifySession } from "@/lib/auth";

export default async function StudentsPage() {
  await verifySession();
  return (
    <ComingSoon title="Students">
      The roster, CSV import and handle verification arrive in Phases 2 and 3.
    </ComingSoon>
  );
}
