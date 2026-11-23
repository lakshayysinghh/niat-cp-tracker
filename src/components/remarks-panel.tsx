"use client";

import { Loader2, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

export interface RemarkItem {
  id: string;
  date: string; // YYYY-MM-DD
  content: string;
  by: string | null;
}

/** "2026-08-28" -> "28/08" (year shown only when not the current year). */
export function shortDate(iso: string, withYear = false): string {
  const [y, m, d] = iso.split("-");
  return withYear ? `${d}/${m}/${y.slice(2)}` : `${d}/${m}`;
}

const todayIst = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date());

/** Add + list + delete dated remarks for one student. */
export function RemarksEditor({ studentId, remarks, compact = false }: { studentId: string; remarks: RemarkItem[]; compact?: boolean }) {
  const router = useRouter();
  const [date, setDate] = useState(todayIst);
  const [content, setContent] = useState(() => remarks.find((r) => r.date === todayIst())?.content ?? "");
  const [pending, setPending] = useState<string | null>(null);
  const existing = remarks.find((r) => r.date === date);
  const thisYear = todayIst().slice(0, 4);

  async function save(e: FormEvent) {
    e.preventDefault();
    setPending("save");
    const r = await api(`/api/students/${studentId}/remarks`, "POST", { remarkDate: date, content });
    setPending(null);
    if (!r.ok) {
      toast.error("Could not save", { description: r.error ?? undefined });
      return;
    }
    toast.success(existing ? `Updated remark for ${shortDate(date)}` : `Saved remark for ${shortDate(date)}`);
    router.refresh();
  }

  async function remove(id: string, d: string) {
    setPending(id);
    const r = await api(`/api/students/${studentId}/remarks?remarkId=${id}`, "DELETE");
    setPending(null);
    if (!r.ok) toast.error("Could not delete", { description: r.error ?? undefined });
    else toast.success(`Deleted remark for ${shortDate(d)}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      <form onSubmit={save} className="flex flex-col gap-2">
        <div className="flex items-end gap-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`rd-${studentId}`} className="text-xs">
              Date
            </Label>
            <Input
              id={`rd-${studentId}`}
              type="date"
              value={date}
              max={todayIst()}
              onChange={(e) => {
                setDate(e.target.value);
                setContent(remarks.find((r) => r.date === e.target.value)?.content ?? "");
              }}
              className="h-8 w-40"
            />
          </div>
          {existing && <span className="pb-2 text-xs text-amber-300">Replaces the note for {shortDate(date)}</span>}
        </div>
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="e.g. Stuck on loops; called parents; promised to finish Sheet #2 by Friday"
          className={cn("text-sm", compact ? "h-20" : "h-24")}
          maxLength={2000}
        />
        <Button type="submit" size="sm" disabled={!content.trim() || pending !== null} className="self-start">
          {pending === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {existing ? "Update note" : "Save note"}
        </Button>
      </form>

      {remarks.length === 0 ? (
        <p className="text-sm text-muted-foreground">No remarks yet.</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-lg border border-border">
          {remarks.map((r) => (
            <li key={r.id} className="group flex gap-3 px-3 py-2.5">
              <span className="w-14 shrink-0 font-mono text-xs tabular-nums text-muted-foreground" title={r.date}>
                {shortDate(r.date, !r.date.startsWith(thisYear))}
              </span>
              <div className="min-w-0 flex-1">
                <p className="whitespace-pre-wrap text-sm">{r.content}</p>
                {r.by && <p className="mt-0.5 text-[11px] text-muted-foreground">{r.by}</p>}
              </div>
              <button
                type="button"
                onClick={() => remove(r.id, r.date)}
                disabled={pending !== null}
                title={`Delete the ${shortDate(r.date)} remark`}
                aria-label={`Delete the ${shortDate(r.date)} remark`}
                className="self-start rounded p-1 text-muted-foreground opacity-0 transition-opacity hover:text-red-300 focus:opacity-100 group-hover:opacity-100"
              >
                {pending === r.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
              </button>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

/** Right-hand slide-over with the editor. */
export function RemarksDrawer({
  open,
  onOpenChange,
  studentId,
  studentName,
  remarks,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  studentId: string;
  studentName: string;
  remarks: RemarkItem[];
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-0 right-0 left-auto h-full max-h-screen max-w-full translate-x-0 translate-y-0 content-start overflow-y-auto rounded-none border-l border-border p-5 sm:max-w-md data-open:slide-in-from-right-8 data-open:zoom-in-100">
        <DialogHeader>
          <DialogTitle>Remarks · {studentName}</DialogTitle>
          <DialogDescription>Dated mentor notes, newest first. One note per day.</DialogDescription>
        </DialogHeader>
        <RemarksEditor key={studentId} studentId={studentId} remarks={remarks} />
      </DialogContent>
    </Dialog>
  );
}
