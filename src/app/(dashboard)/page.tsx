import { AlertTriangle, Trophy } from "lucide-react";
import Link from "next/link";
import { AddContestBar } from "@/components/add-contest-bar";
import { TimeAgo } from "@/components/client-bits";
import { DeleteContestButton, RefreshContestButton } from "@/components/contest-actions";
import { EmptyState, Meter, PageHeader, td, th } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { fixed1, formatDateIST, pct } from "@/lib/format";
import { listContests } from "@/lib/queries/contests";
import { cn } from "@/lib/utils";

export const metadata = { title: "Contests" };

export default async function ContestsPage() {
  await verifySession();
  const { rosterSize, contests } = await listContests();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Contests" description={`${contests.length} tracked · ${rosterSize} students in Batch 1`} />
      <AddContestBar />

      <section className="overflow-hidden rounded-xl border border-border bg-card/40">
        {contests.length === 0 ? (
          <EmptyState icon={<Trophy className="size-6" />} title="No contests yet">
            Paste a contest link above, for example <span className="font-mono text-foreground/80">https://codeforces.com/group/vP4zGe21UV/contest/734032</span>.
            Copy it from the contest page on Codeforces; any tab (Problems, Standings) works.
          </EmptyState>
        ) : (
          <div className="scrollbar-thin overflow-x-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="border-b border-border">
                <tr>
                  <th className={th}>Contest</th>
                  <th className={th}>Date</th>
                  <th className={cn(th, "text-right")}>Problems</th>
                  <th className={th}>Live attendance</th>
                  <th className={cn(th, "text-right")}>Avg solved live</th>
                  <th className={cn(th, "text-right")}>Upsolve rate</th>
                  <th className={cn(th, "text-right")}>0 solved</th>
                  <th className={th}>Last synced</th>
                  <th className={cn(th, "text-right")}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contests.map((c) => (
                  <tr key={c.id} className="group transition-colors hover:bg-muted/30">
                    <td className={td}>
                      <Link href={`/contests/${c.id}`} className="font-medium hover:text-primary">
                        {c.title}
                      </Link>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                        <span className="rounded border border-border px-1 py-px text-[10px] uppercase tracking-wide">{c.kind === "GROUP" ? "Group" : "Gym"}</span>
                        <span className="font-mono">{c.cfContestId}</span>
                      </div>
                    </td>
                    <td className={cn(td, "whitespace-nowrap text-muted-foreground")}>{formatDateIST(c.startsAt)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>{c.problemCount || "—"}</td>
                    <td className={td}>
                      <Meter value={c.stats.live} max={rosterSize} label={`${c.stats.live} / ${rosterSize}`} />
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>
                      {c.stats.live ? `${fixed1(c.stats.liveSolves / c.stats.live)}` : "—"}
                      <span className="text-muted-foreground"> / {c.problemCount || "—"}</span>
                    </td>
                    <td className={cn(td, "text-right tabular-nums")}>{pct(c.stats.upsolved, c.stats.upsolveBase)}</td>
                    <td className={cn(td, "text-right tabular-nums")}>
                      {c.stats.zeroLive > 0 ? <span className="text-amber-300">{c.stats.zeroLive}</span> : <span className="text-muted-foreground">0</span>}
                    </td>
                    <td className={cn(td, "whitespace-nowrap")}>
                      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                        {c.lastSyncError && (
                          <span title={c.lastSyncError} className="text-red-300">
                            <AlertTriangle className="size-3.5" aria-label="Last sync failed" />
                          </span>
                        )}
                        <TimeAgo date={c.lastSyncedAt} />
                      </span>
                    </td>
                    <td className={cn(td, "text-right")}>
                      <div className="flex items-center justify-end gap-0.5">
                        <Link href={`/contests/${c.id}`} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-muted hover:text-foreground">
                          Open
                        </Link>
                        <RefreshContestButton id={c.id} />
                        <DeleteContestButton id={c.id} title={c.title} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {contests.some((c) => c.lastSyncError) && (
        <p className="text-xs text-muted-foreground">
          <AlertTriangle className="mr-1 inline size-3.5 text-red-300" aria-hidden />
          Hover the warning icon to see why a sync failed. A contest the API cannot see usually needs its <span className="text-foreground">Manager</span> box ticked on
          the group&apos;s Contests page on Codeforces.
        </p>
      )}
    </div>
  );
}
