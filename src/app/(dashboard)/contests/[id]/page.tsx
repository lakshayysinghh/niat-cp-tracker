import { AlertTriangle, ExternalLink } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TimeAgo } from "@/components/client-bits";
import { RefreshContestButton } from "@/components/contest-actions";
import { ContestMatrixTable } from "@/components/contest-matrix-table";
import { LegendRow } from "@/components/status-badge";
import { ErrorBanner, PageHeader, Stat } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { fixed1, formatDateIST, pct, standingsUrl } from "@/lib/format";
import { getContestMatrix } from "@/lib/queries/contests";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function generateMetadata({ params }: PageProps<"/contests/[id]">) {
  const { id } = await params;
  if (!UUID.test(id)) return { title: "Contest" };
  const m = await getContestMatrix(id);
  return { title: m?.contest.title ?? "Contest" };
}

export default async function ContestPage({ params }: PageProps<"/contests/[id]">) {
  await verifySession();
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const m = await getContestMatrix(id);
  if (!m) notFound();
  const { contest, problems, rows, kpis } = m;
  const ref = { kind: contest.kind, cfContestId: contest.cfContestId, groupCode: contest.groupCode };
  const slug = contest.title.replace(/[^\w-]+/g, "_").replace(/_+/g, "_").slice(0, 60);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span>
            <Link href="/" className="hover:text-foreground">
              Contests
            </Link>{" "}
            / <span className="font-mono">{contest.cfContestId}</span>
          </span>
        }
        title={
          <span className="inline-flex items-center gap-2">
            {contest.title}
            <a href={standingsUrl(ref)} target="_blank" rel="noreferrer" title="Open standings on Codeforces" className="text-muted-foreground hover:text-foreground">
              <ExternalLink className="size-4" aria-hidden />
              <span className="sr-only">Open on Codeforces</span>
            </a>
          </span>
        }
        description={
          <span>
            {formatDateIST(contest.startsAt)} · {contest.scoringType ?? "—"} · {kpis.problemCount} problems · synced <TimeAgo date={contest.lastSyncedAt} />
            {contest.resolvedMode && <span> · {contest.resolvedMode.toLowerCase()} mode</span>}
          </span>
        }
        actions={<RefreshContestButton id={contest.id} variant="outline" label="Refresh now" />}
      />

      {contest.lastSyncError && (
        <ErrorBanner>
          <AlertTriangle className="mr-1.5 inline size-4" aria-hidden />
          Last sync failed: {contest.lastSyncError} The table shows the last good snapshot.
        </ErrorBanner>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Attended live" value={`${kpis.live} / ${kpis.students}`} hint={`${pct(kpis.live, kpis.students)} of batch`} />
        <Stat label="Absent" value={kpis.absent} hint={`${kpis.virtual} virtual · ${kpis.practiceOnly} practice only`} />
        <Stat label="Avg solved live" value={`${fixed1(kpis.avgSolvedLive)} / ${kpis.problemCount}`} hint="among live participants" />
        <Stat label="Upsolve rate" value={kpis.upsolveRate == null ? "—" : `${Math.round(kpis.upsolveRate * 100)}%`} hint="of problems left after the contest" />
        <Stat label="Fully solved" value={kpis.fullySolved} tone={kpis.fullySolved ? "good" : "default"} hint="all problems, any way" />
        <Stat label="0 solved" value={kpis.zeroSolved} tone={kpis.zeroSolved ? "warn" : "default"} hint="attended live, solved none" />
      </div>

      <ContestMatrixTable contest={ref} problems={problems} rows={rows} fileName={`${slug}_${contest.cfContestId}.csv`} />
      <LegendRow />
    </div>
  );
}
