import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { CopyButton } from "@/components/client-bits";
import { EmptyState, Meter, PageHeader, Panel, Stat, td, th } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { fixed1, formatDateIST, formatPhone, pct } from "@/lib/format";
import { getOverview, RISK_LABEL } from "@/lib/queries/students";
import { cn } from "@/lib/utils";

export const metadata = { title: "Overview" };

export default async function OverviewPage() {
  await verifySession();
  const o = await getOverview();
  const lastLive = o.recent[0];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Batch overview" description="Who missed contests, who is stuck, and who is ahead." />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Students" value={o.rosterSize} />
        <Stat label="Contests tracked" value={o.contestsTracked} />
        <Stat label="Last contest, live" value={lastLive ? `${lastLive.live} / ${o.rosterSize}` : "—"} hint={lastLive ? lastLive.title : undefined} />
        <Stat label="Need follow-up" value={o.atRisk.length} tone={o.atRisk.length ? "warn" : "good"} hint="see the list below" />
      </div>

      <Panel title="Last 10 contests">
        {o.recent.length === 0 ? (
          <EmptyState title="No synced contests yet" />
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Contest</th>
                  <th className={th}>Live</th>
                  <th className={cn(th, "text-right")}>Virtual</th>
                  <th className={cn(th, "text-right")}>Absent</th>
                  <th className={cn(th, "text-right")}>Avg solved live</th>
                  <th className={cn(th, "text-right")}>Upsolve rate</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {o.recent.map((c) => (
                  <tr key={c.id} className="hover:bg-muted/30">
                    <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{formatDateIST(c.startsAt)}</td>
                    <td className={td}>
                      <Link href={`/contests/${c.id}`} className="hover:text-primary">
                        {c.title}
                      </Link>
                    </td>
                    <td className={td}>
                      <Meter value={c.live} max={o.rosterSize} label={`${c.live} · ${pct(c.live, o.rosterSize)}`} />
                    </td>
                    <td className={cn(td, "text-right tabular-nums text-muted-foreground")}>{c.virtual}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{c.absent}</td>
                    <td className={cn(td, "text-right tabular-nums")}>
                      {fixed1(c.avgSolvedLive)}
                      <span className="text-muted-foreground"> / {c.problemCount}</span>
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{c.upsolveRate == null ? "—" : `${Math.round(c.upsolveRate * 100)}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <div className="grid gap-6 xl:grid-cols-5">
        <Panel title="Needs follow-up" description="Missed recent contests, stuck at zero, or handle problems." className="xl:col-span-3">
          {o.atRisk.length === 0 ? (
            <EmptyState icon={<CheckCircle2 className="size-6 text-emerald-400" />} title="Nobody needs follow-up right now" />
          ) : (
            <ul className="divide-y divide-border">
              {o.atRisk.map(({ student: s, reasons }) => (
                <li key={s.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <Link href={`/students/${encodeURIComponent(s.niatId)}`} className="font-medium hover:text-primary">
                      {s.name ?? s.cfHandle}
                    </Link>
                    <span className="ml-2 font-mono text-xs text-muted-foreground">{s.niatId}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {reasons.map((r) => (
                        <span
                          key={r}
                          className={cn(
                            "rounded-md border px-1.5 py-0.5 text-[11px]",
                            r.startsWith("HANDLE") ? "border-red-400/25 text-red-200" : "border-amber-400/25 text-amber-200",
                          )}
                        >
                          {r.startsWith("HANDLE") ? "⚠ " : "• "}
                          {RISK_LABEL[r]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="shrink-0 text-xs text-muted-foreground">
                    <CopyButton value={s.phone} label={formatPhone(s.phone)} />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Leaderboard" description="Live solves + upsolves across all contests." className="xl:col-span-2">
          {o.leaderboard.length === 0 ? (
            <EmptyState title="No students yet" />
          ) : (
            <ol className="divide-y divide-border">
              {o.leaderboard.slice(0, 15).map((l, i) => (
                <li key={l.student.id} className="flex items-center gap-3 px-4 py-2 text-sm">
                  <span className={cn("w-5 text-right tabular-nums text-muted-foreground", i < 3 && "text-primary")}>{i + 1}</span>
                  <Link href={`/students/${encodeURIComponent(l.student.niatId)}`} className="min-w-0 flex-1 truncate hover:text-primary">
                    {l.student.name ?? l.student.cfHandle}
                  </Link>
                  <span className="text-xs tabular-nums text-muted-foreground" title="Contests attended live">
                    {l.liveAttended}/{o.contestsTracked} live
                  </span>
                  <span className="w-16 text-right tabular-nums" title={`${l.liveSolves} live + ${l.upsolves} upsolved`}>
                    {l.liveSolves + l.upsolves}
                    {l.upsolves > 0 && <span className="ml-1 text-[11px] text-sky-300">↻{l.upsolves}</span>}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
