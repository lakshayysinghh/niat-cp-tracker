"use client";

import { Download, ExternalLink, MessageSquarePlus, Search } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { CopyButton } from "@/components/client-bits";
import { columnUrl, ScoreDialog } from "@/components/homework-dialogs";
import { RemarksDrawer, shortDate } from "@/components/remarks-panel";
import { HandleBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatPhone, profileUrl } from "@/lib/format";
import type { HomeworkColumnView, HomeworkStudentRow } from "@/lib/queries/homework";
import { cn } from "@/lib/utils";

const SHEET_REMARK_DATES = 8;

function ScorePill({ solved, total }: { solved: number; total: number }) {
  const tone = solved >= total ? "complete" : solved > 0 ? "partial" : "none";
  return (
    <span
      className={cn(
        "inline-flex min-w-14 items-baseline justify-center gap-0.5 rounded-md px-1.5 py-0.5 tabular-nums ring-1 ring-inset",
        tone === "complete" && "bg-emerald-500/15 text-emerald-200 ring-emerald-400/25",
        tone === "partial" && "bg-sky-500/10 text-foreground ring-sky-400/20",
        tone === "none" && "text-muted-foreground ring-border",
      )}
    >
      {tone === "complete" && <span aria-hidden>✓ </span>}
      <span className="font-medium">{solved}</span>
      <span className="text-[10px] opacity-60">/{total}</span>
    </span>
  );
}

export function HomeworkMaster({
  columns,
  rows,
  remarkDates,
  colleges,
}: {
  columns: HomeworkColumnView[];
  rows: HomeworkStudentRow[];
  remarkDates: string[];
  colleges: string[];
}) {
  const [q, setQ] = useState("");
  const [college, setCollege] = useState("");
  const [view, setView] = useState<"compact" | "sheet">("compact");
  const [scoreFor, setScoreFor] = useState<{ row: HomeworkStudentRow; column: HomeworkColumnView } | null>(null);
  const [remarksFor, setRemarksFor] = useState<string | null>(null);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const digits = needle.replace(/\D/g, "");
    return rows.filter(
      (r) =>
        (!college || r.college === college) &&
        (!needle ||
          (r.name ?? "").toLowerCase().includes(needle) ||
          r.cfHandle.toLowerCase().includes(needle) ||
          r.niatId.toLowerCase().includes(needle) ||
          (digits.length >= 3 && r.phone.includes(digits))),
    );
  }, [rows, q, college]);

  const shownDates = view === "sheet" ? remarkDates.slice(-SHEET_REMARK_DATES) : [];
  const avg = (c: HomeworkColumnView) => (visible.length ? visible.reduce((a, r) => a + (r.scores[c.id]?.solved ?? 0), 0) / visible.length : 0);
  const remarksRow = rows.find((r) => r.id === remarksFor) ?? null;

  function exportCsv() {
    const esc = (v: string | number | null | undefined) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = [
      "Sr no",
      "NIAT ID",
      "Name",
      "Codeforces Username",
      "Phone",
      "College",
      "CF Link",
      ...columns.map((c) => `${c.title} (${c.problemCount} Problems)`),
      ...remarkDates.map((d) => `Remarks - ${shortDate(d)}`),
    ];
    const lines = visible.map((r, i) => {
      const byDate = new Map(r.remarks.map((x) => [x.date, x.content]));
      return [
        i + 1,
        r.niatId,
        r.name,
        r.cfHandle,
        r.phone,
        r.college,
        profileUrl(r.cfHandle),
        ...columns.map((c) => r.scores[c.id]?.solved ?? 0),
        ...remarkDates.map((d) => byDate.get(d) ?? ""),
      ]
        .map(esc)
        .join(",");
    });
    const blob = new Blob(["﻿" + [header.map(esc).join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `homework_master_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  // Sticky identity columns: fixed widths so `left` offsets line up.
  const stick = "sticky z-10 bg-card";
  const c1 = "left-0 w-[44px] min-w-[44px]";
  const c2 = "left-[44px] w-[210px] min-w-[210px]";
  const c3 = "left-[254px] w-[190px] min-w-[190px] border-r border-border";
  const headCell = "border-b border-border bg-card px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, handle, NIAT ID, phone" aria-label="Search students" className="h-8 w-64 pl-8 text-[13px]" />
        </div>
        <select value={college} onChange={(e) => setCollege(e.target.value)} aria-label="College" className="h-8 rounded-md border border-input bg-transparent px-2 text-xs text-foreground">
          <option value="">All colleges</option>
          {colleges.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <div className="inline-flex rounded-md border border-border p-0.5" role="group" aria-label="Remarks view">
          {(["compact", "sheet"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setView(v)}
              aria-pressed={view === v}
              className={cn("rounded px-2.5 py-1 text-xs", view === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground")}
            >
              {v === "compact" ? "Latest remark" : `Remarks by date${remarkDates.length > SHEET_REMARK_DATES ? ` (last ${SHEET_REMARK_DATES})` : ""}`}
            </button>
          ))}
        </div>
        <Button variant="outline" size="sm" onClick={exportCsv} className="ml-auto h-8">
          <Download className="size-3.5" aria-hidden />
          Export master CSV
        </Button>
      </div>

      <div className="scrollbar-thin overflow-auto rounded-xl border border-border bg-card" style={{ maxHeight: "calc(100vh - 300px)", minHeight: 240 }}>
        <table className="w-max min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20">
            <tr>
              <th className={cn(stick, c1, headCell, "z-30 text-right")}>#</th>
              <th className={cn(stick, c2, headCell, "z-30")}>Name</th>
              <th className={cn(stick, c3, headCell, "z-30")}>CF handle</th>
              <th className={headCell}>Phone</th>
              <th className={headCell}>College</th>
              {columns.map((c) => {
                const url = columnUrl(c);
                return (
                  <th key={c.id} className="border-b border-border bg-card px-2 py-2 text-center align-bottom">
                    <div className="mx-auto flex max-w-[150px] flex-col items-center gap-0.5">
                      {url ? (
                        <a href={url} target="_blank" rel="noreferrer" title={`Open ${c.title} on Codeforces`} className="inline-flex items-center gap-1 text-xs font-semibold leading-tight hover:text-primary">
                          <span className="line-clamp-2">{c.title}</span>
                          <ExternalLink className="size-3 shrink-0 opacity-60" aria-hidden />
                        </a>
                      ) : (
                        <span className="line-clamp-2 text-xs font-semibold leading-tight" title="Not linked to a Codeforces contest (Manage columns)">
                          {c.title}
                        </span>
                      )}
                      <span className="text-[10px] font-normal text-muted-foreground">
                        {c.problemCount} problems · avg {avg(c).toFixed(1)}
                      </span>
                    </div>
                  </th>
                );
              })}
              {view === "compact" ? (
                <th className={cn(headCell, "min-w-[260px]")}>Latest remark</th>
              ) : (
                shownDates.map((d) => (
                  <th key={d} className={cn(headCell, "min-w-[160px]")} title={d}>
                    Remarks · {shortDate(d)}
                  </th>
                ))
              )}
              {view === "sheet" && <th className={cn(headCell, "w-12")} aria-label="Add remark" />}
            </tr>
          </thead>
          <tbody>
            {visible.map((r, i) => {
              const latest = r.remarks[0];
              const byDate = new Map(r.remarks.map((x) => [x.date, x.content]));
              return (
                <tr key={r.id} className="group">
                  <td className={cn(stick, c1, "border-b border-border px-3 py-2 text-right text-xs tabular-nums text-muted-foreground group-hover:bg-muted")}>{i + 1}</td>
                  <td className={cn(stick, c2, "border-b border-border px-3 py-2 group-hover:bg-muted")}>
                    <Link href={`/students/${encodeURIComponent(r.niatId)}`} className="block truncate hover:text-primary">
                      {r.name ?? r.niatId}
                    </Link>
                    <div className="font-mono text-[10px] text-muted-foreground">{r.niatId}</div>
                  </td>
                  <td className={cn(stick, c3, "border-b px-3 py-2 group-hover:bg-muted")}>
                    <span className="inline-flex max-w-full items-center gap-1.5">
                      <a href={profileUrl(r.cfHandle)} target="_blank" rel="noreferrer" className="inline-flex min-w-0 items-center gap-1 font-mono text-xs hover:text-primary" title={`Open ${r.cfHandle} on Codeforces`}>
                        <span className="truncate">{r.cfHandle}</span>
                        <ExternalLink className="size-3 shrink-0 opacity-50" aria-hidden />
                      </a>
                      <HandleBadge status={r.handleStatus} compact />
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-border px-3 py-2 text-xs text-muted-foreground group-hover:bg-muted/60">
                    <CopyButton value={r.phone} label={formatPhone(r.phone)} />
                  </td>
                  <td className="border-b border-border px-3 py-2 group-hover:bg-muted/60">
                    {r.college ? (
                      <span className="inline-block max-w-[140px] truncate rounded border border-border px-1.5 py-px text-[11px] text-muted-foreground" title={r.college}>
                        {r.college}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </td>
                  {columns.map((c) => {
                    const s = r.scores[c.id];
                    return (
                      <td key={c.id} className="border-b border-border px-2 py-1.5 text-center group-hover:bg-muted/60">
                        <button
                          type="button"
                          onClick={() => setScoreFor({ row: r, column: c })}
                          title={`${r.name ?? r.cfHandle} · ${c.title}: ${s?.solved ?? 0} of ${c.problemCount}${s?.source === "MANUAL" ? " (edited by hand)" : ""}. Click to edit.`}
                          className="rounded-md outline-none focus-visible:ring-1 focus-visible:ring-ring"
                        >
                          <ScorePill solved={s?.solved ?? 0} total={c.problemCount} />
                        </button>
                      </td>
                    );
                  })}
                  {view === "compact" ? (
                    <td className="border-b border-border px-3 py-2 group-hover:bg-muted/60">
                      <button type="button" onClick={() => setRemarksFor(r.id)} className="flex w-full max-w-[340px] items-start gap-2 text-left">
                        {latest ? (
                          <>
                            <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{shortDate(latest.date)}</span>
                            <span className="line-clamp-2 text-xs" title={latest.content}>
                              {latest.content}
                            </span>
                            {r.remarks.length > 1 && <span className="ml-auto shrink-0 text-[10px] text-muted-foreground">+{r.remarks.length - 1}</span>}
                          </>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
                            <MessageSquarePlus className="size-3.5" aria-hidden />
                            Add remark
                          </span>
                        )}
                      </button>
                    </td>
                  ) : (
                    <>
                      {shownDates.map((d) => (
                        <td key={d} className="border-b border-border px-3 py-2 align-top group-hover:bg-muted/60">
                          <button type="button" onClick={() => setRemarksFor(r.id)} className="line-clamp-2 max-w-[200px] text-left text-xs" title={byDate.get(d)}>
                            {byDate.get(d) ?? <span className="text-muted-foreground/40">·</span>}
                          </button>
                        </td>
                      ))}
                      <td className="border-b border-border px-2 py-2 group-hover:bg-muted/60">
                        <Button variant="ghost" size="icon-sm" onClick={() => setRemarksFor(r.id)} aria-label={`Remarks for ${r.name ?? r.cfHandle}`}>
                          <MessageSquarePlus className="size-3.5" />
                        </Button>
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={6 + columns.length + Math.max(1, shownDates.length)} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No students match. Clear the search or pick another college.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">
        {visible.length} of {rows.length} students · Click a score to correct it, a remark to open the log. Blank or #N/A in the sheet counts as 0. Export uses the same columns
        as the import, so you can edit it in Google Sheets and import it back.
      </p>

      {scoreFor && (
        <ScoreDialog
          key={`${scoreFor.row.id}-${scoreFor.column.id}`}
          open
          onOpenChange={(v) => !v && setScoreFor(null)}
          column={scoreFor.column}
          student={scoreFor.row}
          current={scoreFor.row.scores[scoreFor.column.id]}
        />
      )}
      {remarksRow && (
        <RemarksDrawer open onOpenChange={(v) => !v && setRemarksFor(null)} studentId={remarksRow.id} studentName={remarksRow.name ?? remarksRow.cfHandle} remarks={remarksRow.remarks} />
      )}
    </div>
  );
}
