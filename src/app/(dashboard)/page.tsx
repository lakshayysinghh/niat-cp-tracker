import { Trophy } from "lucide-react";
import { AddContestBar } from "@/components/add-contest-bar";
import { ContestsTable } from "@/components/contests-table";
import { EmptyState, PageHeader } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { listContests } from "@/lib/queries/contests";

export const metadata = { title: "Contests" };

export default async function ContestsPage() {
  await verifySession();
  const { rosterSize, contests } = await listContests();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Contests" description={`${contests.length} tracked · ${rosterSize} students in Batch 1`} />
      <AddContestBar />

      {contests.length === 0 ? (
        <section className="rounded-xl border border-border bg-card/40">
          <EmptyState icon={<Trophy className="size-6" />} title="No contests yet">
            Paste a contest link above, for example <span className="font-mono text-foreground/80">https://codeforces.com/group/vP4zGe21UV/contest/734032</span>.
            Copy it from the contest page on Codeforces; any tab (Problems, Standings) works.
          </EmptyState>
        </section>
      ) : (
        <ContestsTable contests={contests} rosterSize={rosterSize} />
      )}
    </div>
  );
}
