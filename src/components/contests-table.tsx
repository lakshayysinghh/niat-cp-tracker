"use client";

import { AlertTriangle, Search, X } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { TimeAgo } from "@/components/client-bits";
import { DeleteContestButton, RefreshContestButton } from "@/components/contest-actions";
import { Meter, td, th } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { matchesContestQuery } from "@/lib/contest-search";
import { fixed1, formatDateIST, pct } from "@/lib/format";
import type { ContestListItem } from "@/lib/queries/contests";
import { cn } from "@/lib/utils";

type Sort = "NEWEST" | "OLDEST" | "NAME" | "ATTENDANCE";

export function ContestsTable({ contests, rosterSize }: { contests: ContestListItem[]; rosterSize: number }) {
  const [q, setQ] = useState("");
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [sort, setSort] = useState<Sort>("NEWEST");
  const issues = contests.filter((c) => c.lastSyncError).length;

  const visible = useMemo(() => {
    // Every word must match somewhere: "number theory nov" narrows as you type.
    const out = contests.filter((c) => (!onlyIssues || c.lastSyncError) && matchesContestQuery(c, q));
    const t = (c: ContestListItem) => (c.startsAt ? new Date(c.startsAt).getTime() : 0);
    out.sort((a, b) => {
      switch (sort) {
        case "NEWEST":
          return t(b) - t(a);
        case "OLDEST":
          return t(a) - t(b);
        case "NAME":
          return a.title.localeCompare(b.title, "en", { numeric: true });
        case "ATTENDANCE":
          return b.stats.live - a.stats.live || t(b) - t(a);
      }
    });
    return out;
  }, [contests, q, onlyIssues, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQ("")}
            placeholder="Search name, contest ID, group, month…"
            aria-label="Search contests"
            className="h-8 w-72 pl-8 pr-8 text-[13px]"
          />
          {q && (
            <button type="button" onClick={() => setQ("")} aria-label="Clear search" className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        {issues > 0 && (
          <button
            type="button"
            onClick={() => setOnlyIssues((v) => !v)}
            aria-pressed={onlyIssues}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs transition-colors",
              onlyIssues ? "border-red-400/40 bg-red-500/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            <AlertTriangle className="size-3.5 text-red-300" aria-hidden />
            Sync issues
            <span className="tabular-nums opacity-60">{issues}</span>
          </button>
        )}
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground">
            <option value="NEWEST">Newest first</option>
            <option value="OLDEST">Oldest first</option>
            <option value="NAME">Name</option>
            <option value="ATTENDANCE">Live attendance</option>
          </select>
        </label>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card/40">
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
              {visible.map((c) => (
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
              {visible.length === 0 && (
                <tr>
                  <td colSpan={9} className="px-3 py-10 text-center text-sm text-muted-foreground">
                    No contests match “{q}”.{" "}
                    <button
                      type="button"
                      onClick={() => {
                        setQ("");
                        setOnlyIssues(false);
                      }}
                      className="text-primary hover:underline"
                    >
                      Clear search
                    </button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <p className="text-xs text-muted-foreground">
        {visible.length === contests.length ? `${contests.length} contests` : `${visible.length} of ${contests.length} contests`}
        {issues > 0 && (
          <>
            {" "}
            · <AlertTriangle className="mx-0.5 inline size-3 text-red-300" aria-hidden /> hover a warning icon to see why a sync failed; a contest the API cannot see usually needs its{" "}
            <span className="text-foreground">Manager</span> box ticked on Codeforces.
          </>
        )}
      </p>
    </div>
  );
}
