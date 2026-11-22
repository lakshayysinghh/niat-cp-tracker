import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react";
import Link from "next/link";
import { TimeAgo } from "@/components/client-bits";
import { AdminsPanel, GroupsPanel, KeyCheckButton, PasswordForm } from "@/components/settings-panels";
import { EmptyState, ErrorBanner, PageHeader, Panel, td, th } from "@/components/ui-kit";
import { requireRole, verifySession } from "@/lib/auth";
import { getSettings } from "@/lib/queries/settings";
import { cn } from "@/lib/utils";

export const metadata = { title: "Settings" };

const SCHEDULE_HOURS = 3;

/** True when the scheduled sync has not run within one schedule interval plus an hour of slack. */
function isCronStale(lastCronAt: Date | null, now = Date.now()) {
  return !lastCronAt || now - lastCronAt.getTime() > (SCHEDULE_HOURS + 1) * 3600 * 1000;
}

function duration(start: Date, end: Date | null) {
  if (!end) return "running";
  const s = (end.getTime() - start.getTime()) / 1000;
  return s < 60 ? `${s.toFixed(1)} s` : `${Math.round(s / 60)} min`;
}

export default async function SettingsPage() {
  const session = await verifySession();
  requireRole(session, "admin");
  const s = await getSettings();
  const staleCron = isCronStale(s.lastCronAt);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Settings" description="Admins, your password, linked groups and the sync log." actions={<KeyCheckButton />} />

      {s.keyProblem && (
        <ErrorBanner>
          <AlertTriangle className="mr-1.5 inline size-4" aria-hidden />
          Codeforces rejected the API key or signature <TimeAgo date={s.keyProblem.startedAt} />. Check CF_API_KEY and CF_API_SECRET on Render and in the GitHub
          Actions secrets, then use “Check Codeforces key”.
        </ErrorBanner>
      )}

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Admins" description="Who can sign in. You cannot remove yourself or the last admin." className="lg:col-span-3">
          <AdminsPanel admins={s.admins} meId={session.adminId} />
        </Panel>
        <Panel title="Change password" className="lg:col-span-2">
          <PasswordForm />
        </Panel>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        <Panel title="Linked groups" description="New contests in these groups are added automatically." className="lg:col-span-2">
          <GroupsPanel groups={s.groups} />
        </Panel>

        <Panel
          title="Sync log"
          description="Last 50 runs: scheduled (GitHub Actions), manual refreshes and contest adds."
          className="lg:col-span-3"
          actions={
            <span className={cn("inline-flex items-center gap-1.5 text-xs", staleCron ? "text-amber-300" : "text-muted-foreground")}>
              <span aria-hidden className={cn("size-1.5 rounded-full", staleCron ? "bg-amber-400" : "bg-emerald-400")} />
              Scheduled sync {s.lastCronAt ? <>last ran <TimeAgo date={s.lastCronAt} /></> : "has not run yet"}
            </span>
          }
        >
          {s.runs.length === 0 ? (
            <EmptyState title="No syncs yet" />
          ) : (
            <div className="scrollbar-thin max-h-[520px] overflow-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card">
                  <tr>
                    <th className={th}>When</th>
                    <th className={th}>What</th>
                    <th className={th}>Trigger</th>
                    <th className={cn(th, "text-right")}>Calls</th>
                    <th className={cn(th, "text-right")}>Took</th>
                    <th className={th}>Result</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {s.runs.map((r) => (
                    <tr key={r.id} className="align-top hover:bg-muted/30">
                      <td className={cn(td, "whitespace-nowrap text-xs text-muted-foreground")}>
                        <TimeAgo date={r.startedAt} />
                      </td>
                      <td className={td}>
                        <div className="text-xs uppercase tracking-wide text-muted-foreground">{r.kind.toLowerCase()}</div>
                        {r.contestId ? (
                          <Link href={`/contests/${r.contestId}`} className="hover:text-primary">
                            {r.contestTitle}
                          </Link>
                        ) : null}
                      </td>
                      <td className={cn(td, "whitespace-nowrap text-xs text-muted-foreground")}>
                        {r.trigger === "CRON" ? "Scheduled" : r.trigger === "ADD" ? "Added" : "Manual"}
                        {r.by && <div className="max-w-[160px] truncate">{r.by}</div>}
                      </td>
                      <td className={cn(td, "text-right tabular-nums text-muted-foreground")}>{r.cfCalls}</td>
                      <td className={cn(td, "whitespace-nowrap text-right tabular-nums text-muted-foreground")}>{duration(r.startedAt, r.finishedAt)}</td>
                      <td className={td}>
                        {r.ok === false ? (
                          <span className="inline-flex items-start gap-1.5 text-xs text-red-300">
                            <XCircle className="mt-px size-3.5 shrink-0" aria-hidden />
                            <span className="line-clamp-2" title={r.error ?? undefined}>
                              {r.error ?? "Failed"}
                            </span>
                          </span>
                        ) : r.ok ? (
                          <span className="inline-flex items-start gap-1.5 text-xs text-emerald-300">
                            <CheckCircle2 className="mt-px size-3.5 shrink-0" aria-hidden />
                            <span className="line-clamp-2 text-muted-foreground" title={r.error ?? undefined}>
                              {r.error ? r.error.replace(/^warning: /, "") : "OK"}
                            </span>
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Running…</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      </div>
    </div>
  );
}
