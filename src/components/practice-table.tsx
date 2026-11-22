"use client";

import { ArrowDownRight, ArrowUpRight, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState, type ReactNode } from "react";
import { HandleBadge } from "@/components/status-badge";
import { td, th } from "@/components/ui-kit";
import { Input } from "@/components/ui/input";
import { profileUrl } from "@/lib/format";
import type { PracticeRow } from "@/lib/queries/practice";
import { cn } from "@/lib/utils";

type Sort = "PRACTICE_WEEK" | "PRACTICE_MONTH" | "CONTEST_WEEK" | "CONTEST_MONTH" | "IDLE" | "RATING" | "CHANGE";

const INACTIVE_DAYS = 7;
const inactive = (r: PracticeRow) => r.daysSinceAc == null || r.daysSinceAc >= INACTIVE_DAYS;

function Change({ now, then }: { now: number | null; then: number | null }) {
  if (now == null || then == null) return <span className="text-muted-foreground">—</span>;
  const d = now - then;
  if (d === 0) return <span className="text-muted-foreground">±0</span>;
  // Direction carries an arrow + sign, never colour alone.
  return (
    <span className={cn("inline-flex items-center gap-0.5 tabular-nums", d > 0 ? "text-emerald-300" : "text-red-300")}>
      {d > 0 ? <ArrowUpRight className="size-3.5" aria-hidden /> : <ArrowDownRight className="size-3.5" aria-hidden />}
      {d > 0 ? `+${d}` : `−${Math.abs(d)}`}
    </span>
  );
}

const Num = ({ n }: { n: number }) => (n ? <>{n}</> : <span className="text-muted-foreground">0</span>);

/** Column-group header spanning two count columns. */
function Group({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th colSpan={2} scope="colgroup" className={cn("border-b border-border px-3 pt-2.5 pb-1 text-center text-[11px] font-medium uppercase tracking-wider text-muted-foreground", className)}>
      {children}
    </th>
  );
}

export function PracticeTable({ rows }: { rows: PracticeRow[] }) {
  const [q, setQ] = useState("");
  const [onlyIdle, setOnlyIdle] = useState(false);
  const [sort, setSort] = useState<Sort>("PRACTICE_WEEK");
  const idleCount = rows.filter(inactive).length;

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const out = rows.filter(
      (r) =>
        (!onlyIdle || inactive(r)) &&
        (!needle || r.niatId.toLowerCase().includes(needle) || (r.name ?? "").toLowerCase().includes(needle) || r.cfHandle.toLowerCase().includes(needle)),
    );
    const idle = (r: PracticeRow) => r.daysSinceAc ?? 1e6;
    const change = (r: PracticeRow) => (r.rating != null && r.rating30dAgo != null ? r.rating - r.rating30dAgo : -1e6);
    out.sort((a, b) => {
      switch (sort) {
        case "PRACTICE_WEEK":
          return b.practice7 - a.practice7 || b.practice28 - a.practice28;
        case "PRACTICE_MONTH":
          return b.practice28 - a.practice28 || b.practice7 - a.practice7;
        case "CONTEST_WEEK":
          return b.contest7 - a.contest7 || b.contest28 - a.contest28;
        case "CONTEST_MONTH":
          return b.contest28 - a.contest28 || b.contest7 - a.contest7;
        case "IDLE":
          return idle(b) - idle(a);
        case "RATING":
          return (b.rating ?? -1) - (a.rating ?? -1);
        case "CHANGE":
          return change(b) - change(a);
      }
    });
    return out;
  }, [rows, q, onlyIdle, sort]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, NIAT ID or handle" aria-label="Search students" className="h-8 w-64 pl-8 text-[13px]" />
        </div>
        <button
          type="button"
          onClick={() => setOnlyIdle((v) => !v)}
          aria-pressed={onlyIdle}
          className={cn(
            "h-8 rounded-full border px-3 text-xs transition-colors",
            onlyIdle ? "border-amber-400/40 bg-amber-500/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          No AC in {INACTIVE_DAYS} days
          <span className="ml-1.5 tabular-nums opacity-60">{idleCount}</span>
        </button>
        <label className="ml-auto inline-flex items-center gap-2 text-xs text-muted-foreground">
          Sort
          <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground">
            <option value="PRACTICE_WEEK">Practice · this week</option>
            <option value="PRACTICE_MONTH">Practice · 4 weeks</option>
            <option value="CONTEST_WEEK">Contests · this week</option>
            <option value="CONTEST_MONTH">Contests · 4 weeks</option>
            <option value="IDLE">Longest without AC</option>
            <option value="RATING">Rating</option>
            <option value="CHANGE">Rating change (30 d)</option>
          </select>
        </label>
      </div>

      <section className="scrollbar-thin overflow-x-auto rounded-xl border border-border bg-card/40">
        <table className="w-full min-w-[1040px] text-sm">
          <thead>
            <tr>
              <th colSpan={4} aria-hidden className="border-b border-border" />
              <Group className="border-l border-border">Practice</Group>
              <Group className="border-l border-border">Group contests</Group>
              <th colSpan={2} aria-hidden className="border-b border-border" />
            </tr>
            <tr className="border-b border-border">
              <th className={th}>Student</th>
              <th className={th}>Codeforces</th>
              <th className={cn(th, "text-right")}>Rating</th>
              <th className={cn(th, "text-right")}>30-day change</th>
              <th className={cn(th, "border-l border-border text-right")}>7 d</th>
              <th className={cn(th, "text-right")}>28 d</th>
              <th className={cn(th, "border-l border-border text-right")}>7 d</th>
              <th className={cn(th, "text-right")}>28 d</th>
              <th className={cn(th, "text-right")}>Avg practice rating · 28 d</th>
              <th className={cn(th, "text-right")}>Last AC</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className={td}>
                  <Link href={`/students/${encodeURIComponent(r.niatId)}`} className="hover:text-primary">
                    {r.name ?? r.cfHandle}
                  </Link>
                  <div className="font-mono text-[11px] text-muted-foreground">{r.niatId}</div>
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  <span className="inline-flex items-center gap-1.5">
                    <a href={profileUrl(r.cfHandle)} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-primary">
                      {r.cfHandle}
                    </a>
                    {r.handleStatus !== "VALID" && <HandleBadge status={r.handleStatus} compact />}
                  </span>
                </td>
                <td className={cn(td, "text-right tabular-nums")}>{r.rating ?? <span className="text-muted-foreground">unrated</span>}</td>
                <td className={cn(td, "text-right")}>
                  <Change now={r.rating} then={r.rating30dAgo} />
                </td>
                <td className={cn(td, "border-l border-border text-right tabular-nums")}>
                  <Num n={r.practice7} />
                </td>
                <td className={cn(td, "text-right tabular-nums")}>
                  <Num n={r.practice28} />
                </td>
                <td className={cn(td, "border-l border-border text-right tabular-nums")}>
                  <Num n={r.contest7} />
                </td>
                <td className={cn(td, "text-right tabular-nums")}>
                  <Num n={r.contest28} />
                </td>
                <td className={cn(td, "text-right tabular-nums")}>{r.avgRating28 ?? <span className="text-muted-foreground">—</span>}</td>
                <td className={cn(td, "whitespace-nowrap text-right tabular-nums")}>
                  {r.daysSinceAc == null ? (
                    <span className="text-amber-300">never</span>
                  ) : r.daysSinceAc === 0 ? (
                    "today"
                  ) : (
                    <span className={cn(r.daysSinceAc >= INACTIVE_DAYS && "text-amber-300")}>{r.daysSinceAc} d ago</span>
                  )}
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {onlyIdle ? "Everyone has an accepted submission in the last 7 days." : "No students match."}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted-foreground">
        Counts are new problems, each counted once on its first accepted submission, in rolling windows ending now (IST). <span className="text-foreground">Practice</span> is everything
        outside the batch&apos;s group contests (problemset, gyms, other contests); <span className="text-foreground">Group contests</span> covers live, virtual and upsolve solves in the
        tracked mashups. “Last AC” counts both.
      </p>
    </div>
  );
}
