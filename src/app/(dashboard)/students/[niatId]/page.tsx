import { ExternalLink, Phone } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CopyButton, TimeAgo } from "@/components/client-bits";
import { EditStudentButton } from "@/components/edit-student-button";
import { PracticeCharts } from "@/components/practice-charts";
import { HandleBadge, ParticipationBadge } from "@/components/status-badge";
import { EmptyState, Meter, PageHeader, Panel, Stat, td, th } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { fixed1, formatDateIST, formatPhone, isPlaceholderNiatId, pct, problemUrl, profileUrl } from "@/lib/format";
import { getStudentPractice } from "@/lib/queries/practice";
import { getStudentDetail } from "@/lib/queries/students";
import { cn } from "@/lib/utils";

export async function generateMetadata({ params }: PageProps<"/students/[niatId]">) {
  const { niatId } = await params;
  return { title: decodeURIComponent(niatId).toUpperCase() };
}

export default async function StudentPage({ params }: PageProps<"/students/[niatId]">) {
  await verifySession();
  const { niatId } = await params;
  const d = await getStudentDetail(decodeURIComponent(niatId));
  if (!d) notFound();
  const { student: s, history, kpis } = d;
  const practice = await getStudentPractice(s.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={
          <span>
            <Link href="/students" className="hover:text-foreground">
              Students
            </Link>{" "}
            / <span className="font-mono">{s.niatId}</span>
          </span>
        }
        title={s.name ?? s.cfHandle}
        description={
          <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="font-mono">{s.niatId}</span>
            {isPlaceholderNiatId(s.niatId) && <span className="text-amber-300">ID missing: use Edit to set the real NIAT ID</span>}
            {s.college && <span>{s.college}</span>}
            <span className="inline-flex items-center gap-1">
              <Phone className="size-3.5" aria-hidden />
              <CopyButton value={s.phone} label={formatPhone(s.phone)} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              <a href={profileUrl(s.cfHandle)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-foreground hover:text-primary">
                {s.cfHandle}
                <ExternalLink className="size-3" aria-hidden />
              </a>
              <HandleBadge status={s.handleStatus} />
            </span>
          </span>
        }
        actions={
          <EditStudentButton
            student={{ id: s.id, niatId: s.niatId, name: s.name, college: s.college, phone: s.phone, enteredHandle: s.enteredHandle, cfHandle: s.cfHandle }}
          />
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Attendance" value={pct(kpis.attendedLive, kpis.contests)} hint={`${kpis.attendedLive} of ${kpis.contests} live`} />
        <Stat label="Avg solved live" value={fixed1(kpis.avgSolvedLive)} hint="per contest attended" />
        <Stat label="Live solves" value={kpis.liveSolves} hint={kpis.virtualSolves ? `+ ${kpis.virtualSolves} virtual` : undefined} />
        <Stat label="Upsolves" value={kpis.upsolves} hint={kpis.upsolveRate == null ? undefined : `${Math.round(kpis.upsolveRate * 100)}% upsolve rate`} />
        <Stat label="Rating" value={s.cfRating ?? "—"} hint={s.cfMaxRating ? `max ${s.cfMaxRating}${s.cfRank ? ` · ${s.cfRank}` : ""}` : (s.cfRank ?? undefined)} />
        <Stat label="Last online" value={<TimeAgo date={s.cfLastOnlineAt} className="text-base" />} hint="on Codeforces" />
      </div>

      <Panel title="Contest history" description="Newest first. Chips are the problems still unsolved; open one to practise it.">
        {history.length === 0 ? (
          <EmptyState title="No contests synced yet">Add a contest on the Contests page to see this student&apos;s results.</EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Date</th>
                  <th className={th}>Contest</th>
                  <th className={th}>Participation</th>
                  <th className={cn(th, "text-right")}>Rank</th>
                  <th className={th}>Solved live</th>
                  <th className={cn(th, "text-right")}>Upsolved</th>
                  <th className={th}>Still unsolved</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.map((h) => (
                  <tr key={h.contestId} className="hover:bg-muted/30">
                    <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{formatDateIST(h.startsAt)}</td>
                    <td className={td}>
                      <Link href={`/contests/${h.contestId}`} className="hover:text-primary">
                        {h.title}
                      </Link>
                    </td>
                    <td className={td}>
                      <ParticipationBadge kind={h.participation} />
                    </td>
                    <td className={cn(td, "text-right tabular-nums text-muted-foreground")}>{h.rank ?? "—"}</td>
                    <td className={td}>
                      <Meter value={h.solvedLive + h.solvedVirtual} max={h.problemCount} label={`${h.solvedLive + h.solvedVirtual} / ${h.problemCount}`} />
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{h.upsolved ? <span className="text-sky-300">↻ {h.upsolved}</span> : <span className="text-muted-foreground">0</span>}</td>
                    <td className={td}>
                      {h.unsolved.length === 0 ? (
                        <span className="text-xs text-emerald-300">All solved ✓</span>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {h.unsolved.map((u) => (
                            <a
                              key={u.index}
                              href={problemUrl(h, u.index)}
                              target="_blank"
                              rel="noreferrer"
                              title={`${u.index}. ${u.name}${u.rejected ? ` · ${u.rejected} wrong tries` : ""}`}
                              className={cn(
                                "inline-flex h-6 min-w-7 items-center justify-center rounded-md border px-1.5 font-mono text-xs transition-colors hover:border-primary/50 hover:text-primary",
                                u.rejected ? "border-amber-400/30 text-amber-200" : "border-border text-muted-foreground",
                              )}
                            >
                              {u.index}
                            </a>
                          ))}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">Practice</h2>
        <PracticeCharts data={practice} />
      </section>
    </div>
  );
}
