"use client";

import { Download, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/client-bits";
import { CellBadge, cellCode, HandleBadge, ParticipationBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone, isPlaceholderNiatId, problemUrl, profileUrl, type ContestRef } from "@/lib/format";
import type { MatrixProblem, MatrixRow } from "@/lib/queries/contests";
import { cn } from "@/lib/utils";

type Filter = "ALL" | "ABSENT" | "ZERO" | "PROGRESS" | "DONE" | "HANDLE";
type Sort = "SOLVED_DESC" | "SOLVED_ASC" | "RANK" | "NIAT";

const FILTERS: Array<[Filter, string]> = [
  ["ALL", "All"],
  ["ABSENT", "Absent"],
  ["ZERO", "0 solved"],
  ["PROGRESS", "In progress"],
  ["DONE", "Completed"],
  ["HANDLE", "Handle issue"],
];

const solvedOf = (r: MatrixRow) => r.solvedLive + r.solvedVirtual;
const totalOf = (r: MatrixRow) => r.solvedLive + r.solvedVirtual + r.upsolved;

export function ContestMatrixTable({
  contest,
  problems,
  rows,
  fileName,
}: {
  contest: ContestRef;
  problems: MatrixProblem[];
  rows: MatrixRow[];
  fileName: string;
}) {
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("ALL");
  const [sort, setSort] = useState<Sort>("SOLVED_DESC");
  const n = problems.length;

  const counts = useMemo(() => {
    const c: Record<Filter, number> = { ALL: rows.length, ABSENT: 0, ZERO: 0, PROGRESS: 0, DONE: 0, HANDLE: 0 };
    for (const r of rows) {
      if (!r.participation) c.ABSENT++;
      else if (totalOf(r) === 0) c.ZERO++;
      else if (n > 0 && totalOf(r) >= n) c.DONE++;
      else c.PROGRESS++;
      if (r.handleStatus !== "VALID") c.HANDLE++;
    }
    return c;
  }, [rows, n]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    const out = rows.filter((r) => {
      if (filter === "ABSENT" && r.participation) return false;
      if (filter === "ZERO" && !(r.participation && totalOf(r) === 0)) return false;
      if (filter === "PROGRESS" && !(r.participation && totalOf(r) > 0 && totalOf(r) < n)) return false;
      if (filter === "DONE" && !(r.participation && n > 0 && totalOf(r) >= n)) return false;
      if (filter === "HANDLE" && r.handleStatus === "VALID") return false;
      if (!needle) return true;
      return (
        r.niatId.toLowerCase().includes(needle) ||
        (r.name ?? "").toLowerCase().includes(needle) ||
        r.cfHandle.toLowerCase().includes(needle) ||
        (r.college ?? "").toLowerCase().includes(needle) ||
        (digits.length >= 3 && r.phone.includes(digits))
      );
    });
    const byNiat = (a: MatrixRow, b: MatrixRow) => a.niatId.localeCompare(b.niatId);
    out.sort((a, b) => {
      switch (sort) {
        case "SOLVED_DESC":
          return solvedOf(b) - solvedOf(a) || b.upsolved - a.upsolved || (a.rank ?? 1e9) - (b.rank ?? 1e9) || byNiat(a, b);
        case "SOLVED_ASC":
          return solvedOf(a) - solvedOf(b) || a.upsolved - b.upsolved || byNiat(a, b);
        case "RANK":
          return (a.rank ?? 1e9) - (b.rank ?? 1e9) || byNiat(a, b);
        case "NIAT":
          return byNiat(a, b);
      }
    });
    return out;
  }, [rows, q, filter, sort, n]);

  function exportCsv() {
    const esc = (v: string | number | null) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["NIAT ID", "Name", "Phone", "Handle", "Participation", "Rank", "Solved live", "Solved virtual", "Upsolved", ...problems.map((p) => p.index)];
    const lines = visible.map((r) =>
      [
        r.niatId,
        r.name,
        r.phone,
        r.cfHandle,
        r.participation === "PRACTICE_ONLY" ? "Practice only" : r.participation ? r.participation[0] + r.participation.slice(1).toLowerCase() : "Absent",
        r.rank,
        r.solvedLive,
        r.solvedVirtual,
        r.upsolved,
        ...problems.map((p) => cellCode(r.cells[p.index]).csv),
      ]
        .map(esc)
        .join(","),
    );
    const blob = new Blob(["﻿" + [header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Sticky identity columns: fixed widths so `left` offsets line up.
  const stick = "sticky z-10 bg-card";
  const c1 = "left-0 w-[132px] min-w-[132px]";
  const c2 = "left-[132px] w-[200px] min-w-[200px]";
  const c3 = "left-[332px] w-[170px] min-w-[170px] border-r border-border";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search NIAT ID, name, handle, phone" aria-label="Search students" className="h-8 w-72 pl-8 text-[13px]" />
          </div>
          <div className="flex flex-wrap items-center gap-1" role="group" aria-label="Filter">
            {FILTERS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                aria-pressed={filter === key}
                className={cn(
                  "h-8 rounded-full border px-3 text-xs transition-colors",
                  filter === key ? "border-primary/40 bg-primary/10 text-foreground" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
                <span className="ml-1.5 tabular-nums opacity-60">{counts[key]}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 text-xs text-muted-foreground">
            Sort
            <select value={sort} onChange={(e) => setSort(e.target.value as Sort)} className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground">
              <option value="SOLVED_DESC">Solved: high to low</option>
              <option value="SOLVED_ASC">Solved: low to high</option>
              <option value="RANK">Rank</option>
              <option value="NIAT">NIAT ID</option>
            </select>
          </label>
          <Button variant="outline" size="sm" onClick={exportCsv} className="h-8">
            <Download className="size-3.5" aria-hidden />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="scrollbar-thin overflow-auto rounded-xl border border-border bg-card" style={{ maxHeight: "calc(100vh - 290px)", minHeight: 240 }}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr className="bg-card">
              {[
                [c1, "NIAT ID"],
                [c2, "Student"],
                [c3, "Handle"],
              ].map(([pos, label]) => (
                <th key={label} className={cn(stick, pos, "z-30 border-b border-border px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground")}>
                  {label}
                </th>
              ))}
              {["Phone", "Status", "Rank", "Solved", "Upsolved"].map((h) => (
                <th key={h} className={cn("border-b border-border bg-card px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground", h !== "Phone" && h !== "Status" && "text-right")}>
                  {h}
                </th>
              ))}
              {problems.map((p) => (
                <th key={p.index} className="border-b border-border bg-card px-1 py-1.5 text-center">
                  <a
                    href={problemUrl(contest, p.index)}
                    target="_blank"
                    rel="noreferrer"
                    title={`${p.index}. ${p.name}${p.rating ? ` · rating ${p.rating}` : ""}${p.maxPoints ? ` · ${p.maxPoints} pts` : ""}`}
                    className="flex flex-col items-center rounded px-1.5 py-0.5 hover:bg-muted"
                  >
                    <span className="text-xs font-semibold">{p.index}</span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {p.solvedBy}/{rows.length}
                    </span>
                  </a>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => (
              <tr key={r.studentId} className="group">
                <td className={cn(stick, c1, "border-b border-border px-3 py-2 group-hover:bg-muted")}>
                  <Link href={`/students/${encodeURIComponent(r.niatId)}`} className="font-mono text-xs hover:text-primary">
                    {r.niatId}
                  </Link>
                  {isPlaceholderNiatId(r.niatId) && <div className="text-[10px] text-amber-300">ID missing</div>}
                </td>
                <td className={cn(stick, c2, "border-b border-border px-3 py-2 group-hover:bg-muted")}>
                  <div className="truncate">{r.name ?? <span className="text-muted-foreground">—</span>}</div>
                  {r.college && <div className="truncate text-[11px] text-muted-foreground">{r.college}</div>}
                </td>
                <td className={cn(stick, c3, "border-b px-3 py-2 group-hover:bg-muted")}>
                  <span className="inline-flex max-w-full items-center gap-1.5">
                    <a href={profileUrl(r.cfHandle)} target="_blank" rel="noreferrer" className="truncate hover:text-primary">
                      {r.cfHandle}
                    </a>
                    {r.handleStatus !== "VALID" && <HandleBadge status={r.handleStatus} compact />}
                  </span>
                </td>
                <td className="whitespace-nowrap border-b border-border px-3 py-2 text-xs text-muted-foreground group-hover:bg-muted/60">
                  <CopyButton value={r.phone} label={formatPhone(r.phone)} />
                </td>
                <td className="whitespace-nowrap border-b border-border px-3 py-2 group-hover:bg-muted/60">
                  <ParticipationBadge kind={r.participation} />
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums text-muted-foreground group-hover:bg-muted/60">{r.rank ?? "—"}</td>
                <td className="whitespace-nowrap border-b border-border px-3 py-2 text-right tabular-nums group-hover:bg-muted/60">
                  <span className={cn(r.participation && solvedOf(r) === 0 && "text-amber-300")}>{solvedOf(r)}</span>
                  <span className="text-muted-foreground"> / {n}</span>
                </td>
                <td className="border-b border-border px-3 py-2 text-right tabular-nums group-hover:bg-muted/60">
                  {r.upsolved ? <span className="text-sky-300">{r.upsolved}</span> : <span className="text-muted-foreground">0</span>}
                </td>
                {problems.map((p) => (
                  <td key={p.index} className="border-b border-border px-1 py-1.5 text-center group-hover:bg-muted/60">
                    <CellBadge cell={r.cells[p.index]} problem={`${p.index}. ${p.name}`} />
                  </td>
                ))}
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={8 + problems.length} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No students match. Clear the search or pick another filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        Showing {visible.length} of {rows.length} students. Export includes only the rows shown.
      </p>
    </div>
  );
}
