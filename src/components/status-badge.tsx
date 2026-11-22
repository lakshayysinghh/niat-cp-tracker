import { AlertTriangle, CheckCircle2, CircleHelp } from "lucide-react";
import type { CellStatus, ParticipationKind } from "@/db/schema";
import { formatClock } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Status badges. Colour is never the only signal (Section 3, rule 9):
 * every badge carries a symbol or text, and a title for the details.
 */

export interface CellLike {
  status: CellStatus;
  rejectedAttempts: number;
  points: number | null;
  solvedAtSeconds: number | null;
}

export function cellTitle(cell: CellLike | undefined, problem: string): string {
  if (!cell) return `${problem}: not attempted`;
  const n = cell.rejectedAttempts;
  const tries = `${n} wrong ${n === 1 ? "try" : "tries"}`;
  switch (cell.status) {
    case "SOLVED_LIVE":
      return `${problem}: solved at ${formatClock(cell.solvedAtSeconds)} in contest${n ? ` after ${tries}` : ""}`;
    case "SOLVED_VIRTUAL":
      return `${problem}: solved in virtual at ${formatClock(cell.solvedAtSeconds)}${n ? ` after ${tries}` : ""}`;
    case "UPSOLVED":
      return `${problem}: upsolved after the contest; ${tries} in total`;
    case "ATTEMPTED":
      return cell.points != null ? `${problem}: partial score ${cell.points}; ${tries}` : `${problem}: ${tries}, not solved`;
  }
}

/** Short text code used in the badge and the CSV export. */
export function cellCode(cell: CellLike | undefined): { text: string; csv: string } {
  if (!cell) return { text: "·", csv: "" };
  const n = cell.rejectedAttempts;
  switch (cell.status) {
    case "SOLVED_LIVE":
      return { text: n ? `✓+${n}` : "✓", csv: "L" };
    case "SOLVED_VIRTUAL":
      return { text: "✓v", csv: "V" };
    case "UPSOLVED":
      return { text: "↻", csv: "U" };
    case "ATTEMPTED":
      return { text: cell.points != null ? String(cell.points) : `−${n}`, csv: cell.points != null ? String(cell.points) : `-${n}` };
  }
}

const CELL_STYLE: Record<CellStatus, string> = {
  SOLVED_LIVE: "bg-emerald-500/15 text-emerald-300 ring-emerald-400/25",
  SOLVED_VIRTUAL: "bg-teal-500/15 text-teal-200 ring-teal-400/25",
  UPSOLVED: "bg-sky-500/15 text-sky-300 ring-sky-400/25",
  ATTEMPTED: "bg-amber-500/10 text-amber-300 ring-amber-400/20",
};

export function CellBadge({ cell, problem }: { cell: CellLike | undefined; problem: string }) {
  const { text } = cellCode(cell);
  return (
    <span
      title={cellTitle(cell, problem)}
      className={cn(
        "inline-flex h-6 min-w-9 items-center justify-center rounded-md px-1 text-xs font-medium tabular-nums",
        cell ? cn("ring-1 ring-inset", CELL_STYLE[cell.status]) : "text-muted-foreground/35",
      )}
    >
      {text}
    </span>
  );
}

const PART: Record<ParticipationKind | "ABSENT", { label: string; dot: string; text: string }> = {
  LIVE: { label: "Live", dot: "bg-emerald-400", text: "text-foreground" },
  VIRTUAL: { label: "Virtual", dot: "bg-teal-300", text: "text-foreground" },
  PRACTICE_ONLY: { label: "Practice", dot: "bg-sky-400", text: "text-foreground" },
  ABSENT: { label: "Absent", dot: "border border-muted-foreground/50", text: "text-muted-foreground" },
};

export function ParticipationBadge({ kind }: { kind: ParticipationKind | null }) {
  const p = PART[kind ?? "ABSENT"];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs", p.text)}>
      <span aria-hidden className={cn("size-1.5 rounded-full", p.dot)} />
      {p.label}
    </span>
  );
}

export function HandleBadge({ status, compact = false }: { status: "UNVERIFIED" | "VALID" | "INVALID"; compact?: boolean }) {
  if (status === "VALID") {
    return (
      <span title="Verified on Codeforces" className="inline-flex items-center gap-1 text-xs text-emerald-300/90">
        <CheckCircle2 className="size-3.5" aria-hidden />
        {!compact && "Verified"}
        {compact && <span className="sr-only">Verified</span>}
      </span>
    );
  }
  if (status === "INVALID") {
    return (
      <span title="Codeforces says this handle does not exist" className="inline-flex items-center gap-1 text-xs text-red-300">
        <AlertTriangle className="size-3.5" aria-hidden />
        {compact ? <span className="sr-only">Not found</span> : "Not found"}
      </span>
    );
  }
  return (
    <span title="Not verified yet" className="inline-flex items-center gap-1 text-xs text-amber-300">
      <CircleHelp className="size-3.5" aria-hidden />
      {compact ? <span className="sr-only">Unverified</span> : "Unverified"}
    </span>
  );
}

export function LegendRow() {
  const items: Array<[string, string, string]> = [
    ["✓", CELL_STYLE.SOLVED_LIVE, "Solved live"],
    ["✓v", CELL_STYLE.SOLVED_VIRTUAL, "Solved in virtual"],
    ["↻", CELL_STYLE.UPSOLVED, "Upsolved"],
    ["−2", CELL_STYLE.ATTEMPTED, "Wrong tries, unsolved"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground">
      {items.map(([t, style, label]) => (
        <span key={label} className="inline-flex items-center gap-1.5">
          <span className={cn("inline-flex h-5 min-w-7 items-center justify-center rounded px-1 font-medium ring-1 ring-inset", style)}>{t}</span>
          {label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="inline-flex h-5 min-w-7 items-center justify-center text-muted-foreground/40">·</span>
        Not attempted
      </span>
    </div>
  );
}
