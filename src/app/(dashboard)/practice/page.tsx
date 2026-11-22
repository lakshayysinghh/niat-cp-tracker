import { Dumbbell } from "lucide-react";
import { TimeAgo } from "@/components/client-bits";
import { PracticeTable } from "@/components/practice-table";
import { EmptyState, PageHeader, Stat } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { getPracticeTable } from "@/lib/queries/practice";

export const metadata = { title: "Practice" };

export default async function PracticePage() {
  await verifySession();
  const { rows, lastSyncedAt } = await getPracticeTable();
  const active = rows.filter((r) => r.solved7 > 0).length;
  const idle = rows.filter((r) => r.daysSinceAc == null || r.daysSinceAc >= 7).length;
  const weekTotal = rows.reduce((a, r) => a + r.solved7, 0);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Practice"
        description={
          <>
            Codeforces practice outside contests · updated daily at 03:47 IST · last sync <TimeAgo date={lastSyncedAt} />
          </>
        }
      />
      {lastSyncedAt == null ? (
        <section className="rounded-xl border border-border bg-card/40">
          <EmptyState icon={<Dumbbell className="size-6" />} title="No practice data yet">
            The daily practice sync has not run yet. Run <span className="font-mono text-foreground">npm run practice</span> or start the “Practice sync” workflow on GitHub.
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Practised this week" value={`${active} / ${rows.length}`} hint="solved at least one new problem in 7 days" />
            <Stat label="Problems solved this week" value={weekTotal} hint="new problems, whole batch" />
            <Stat label="No AC in 7 days" value={idle} tone={idle ? "warn" : "good"} hint="filter the table to follow up" />
            <Stat label="Median rating" value={median(rows.map((r) => r.rating).filter((r): r is number => r != null)) ?? "—"} hint="rated students only" />
          </div>
          <PracticeTable rows={rows} />
        </>
      )}
    </div>
  );
}

function median(xs: number[]): number | null {
  if (xs.length === 0) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}
