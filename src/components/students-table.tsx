"use client";

import { Loader2, Pencil, Search, Trash2, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CopyButton, TimeAgo } from "@/components/client-bits";
import { HandleBadge } from "@/components/status-badge";
import { StudentFormDialog, type EditableStudent } from "@/components/student-dialogs";
import { EmptyState, stickyHead, tableScroll, td, th } from "@/components/ui-kit";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { formatPhone, isPlaceholderNiatId, profileUrl } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RosterTableRow extends EditableStudent {
  handleStatus: "UNVERIFIED" | "VALID" | "INVALID";
  cfRating: number | null;
  cfLastOnlineAt: Date | string | null;
  liveAttended: number;
  contestsTracked: number;
  liveSolves: number;
  upsolves: number;
}

export function StudentsTable({ rows }: { rows: RosterTableRow[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<RosterTableRow | null>(null);
  const [deleting, setDeleting] = useState<RosterTableRow | null>(null);
  const [pending, setPending] = useState(false);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    const digits = needle.replace(/\D/g, "");
    return rows.filter(
      (r) =>
        r.niatId.toLowerCase().includes(needle) ||
        (r.name ?? "").toLowerCase().includes(needle) ||
        r.cfHandle.toLowerCase().includes(needle) ||
        (r.college ?? "").toLowerCase().includes(needle) ||
        (digits.length >= 3 && r.phone.includes(digits)),
    );
  }, [rows, q]);

  async function remove() {
    if (!deleting) return;
    setPending(true);
    const r = await api(`/api/students/${deleting.id}`, "DELETE");
    setPending(false);
    if (!r.ok) {
      toast.error("Could not delete", { description: r.error ?? undefined });
      return;
    }
    toast.success(`Deleted ${deleting.niatId}`);
    setDeleting(null);
    router.refresh();
  }

  if (rows.length === 0) {
    return (
      <section className="rounded-xl border border-border bg-card/40">
        <EmptyState icon={<Users className="size-6" />} title="No students yet">
          Use <span className="text-foreground">Import CSV</span> to add the batch, or <span className="text-foreground">Add student</span> for one at a time.
        </EmptyState>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, NIAT ID, handle, college or phone" aria-label="Search students" className="h-8 pl-8 text-[13px]" />
      </div>

      <section className={cn(tableScroll, "rounded-xl border border-border bg-card/40")} style={{ maxHeight: "calc(100vh - 250px)", minHeight: 280 }}>
        <table className="w-full min-w-[1040px] text-sm">
          <thead className={stickyHead}>
            <tr>
              <th className={th}>NIAT ID</th>
              <th className={th}>Student</th>
              <th className={th}>Phone</th>
              <th className={th}>Codeforces</th>
              <th className={cn(th, "text-right")}>Rating</th>
              <th className={cn(th, "text-right")}>Attended live</th>
              <th className={cn(th, "text-right")}>Live solves</th>
              <th className={cn(th, "text-right")}>Upsolves</th>
              <th className={th}>Last online</th>
              <th className={th}>
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {visible.map((r) => (
              <tr key={r.id} className="transition-colors hover:bg-muted/30">
                <td className={cn(td, "whitespace-nowrap")}>
                  <Link href={`/students/${encodeURIComponent(r.niatId)}`} className="font-mono text-xs hover:text-primary">
                    {r.niatId}
                  </Link>
                  {isPlaceholderNiatId(r.niatId) && (
                    <button type="button" onClick={() => setEditing(r)} className="ml-2 rounded border border-amber-400/30 px-1 text-[10px] text-amber-300 hover:bg-amber-500/10">
                      ID missing · edit
                    </button>
                  )}
                </td>
                <td className={td}>
                  <div className="max-w-[240px] truncate">{r.name ?? <span className="text-muted-foreground">—</span>}</div>
                  {r.college && <div className="max-w-[240px] truncate text-[11px] text-muted-foreground">{r.college}</div>}
                </td>
                <td className={cn(td, "whitespace-nowrap text-xs text-muted-foreground")}>
                  <CopyButton value={r.phone} label={formatPhone(r.phone)} />
                </td>
                <td className={cn(td, "whitespace-nowrap")}>
                  <span className="inline-flex items-center gap-2">
                    <a href={profileUrl(r.cfHandle)} target="_blank" rel="noreferrer" className="font-mono text-xs hover:text-primary">
                      {r.cfHandle}
                    </a>
                    <HandleBadge status={r.handleStatus} compact={r.handleStatus === "VALID"} />
                  </span>
                </td>
                <td className={cn(td, "text-right tabular-nums")}>{r.cfRating ?? <span className="text-muted-foreground">—</span>}</td>
                <td className={cn(td, "text-right tabular-nums")}>
                  {r.liveAttended}
                  <span className="text-muted-foreground"> / {r.contestsTracked}</span>
                </td>
                <td className={cn(td, "text-right tabular-nums")}>{r.liveSolves}</td>
                <td className={cn(td, "text-right tabular-nums")}>{r.upsolves ? <span className="text-sky-300">{r.upsolves}</span> : <span className="text-muted-foreground">0</span>}</td>
                <td className={cn(td, "whitespace-nowrap text-xs text-muted-foreground")}>
                  <TimeAgo date={r.cfLastOnlineAt} />
                </td>
                <td className={cn(td, "text-right")}>
                  <div className="flex justify-end gap-0.5">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(r)} title={`Edit ${r.niatId}`}>
                      <Pencil className="size-3.5" aria-hidden />
                      <span className="sr-only">Edit</span>
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleting(r)} title={`Delete ${r.niatId}`} className="text-muted-foreground hover:text-red-300">
                      <Trash2 className="size-3.5" aria-hidden />
                      <span className="sr-only">Delete</span>
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
            {visible.length === 0 && (
              <tr>
                <td colSpan={10} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  No students match “{q}”.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
      <p className="text-xs text-muted-foreground">
        {visible.length} of {rows.length} students
      </p>

      {editing && <StudentFormDialog key={editing.id} open onOpenChange={(v) => !v && setEditing(null)} student={editing} />}

      <Dialog open={Boolean(deleting)} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {deleting?.niatId}?</DialogTitle>
            <DialogDescription>
              {deleting?.name ?? deleting?.cfHandle} and their contest results will be removed from the dashboard. This cannot be undone; re-import them to add them back.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
