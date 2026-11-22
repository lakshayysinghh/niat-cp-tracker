"use client";

import { Loader2, RefreshCw, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api } from "@/lib/api-client";

export function RefreshContestButton({ id, variant = "ghost", label }: { id: string; variant?: "ghost" | "outline"; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function refresh() {
    setPending(true);
    const r = await api<{ participants: number; cells: number }>(`/api/contests/${id}/sync`, "POST");
    setPending(false);
    if (r.ok && r.data) toast.success("Synced", { description: `${r.data.participants} participants · ${r.data.cells} cells` });
    else if (r.status === 429) toast.info(r.error ?? "Synced moments ago");
    else toast.error("Sync failed", { description: r.error ?? undefined });
    router.refresh();
  }

  return (
    <Button type="button" variant={variant} size="sm" onClick={refresh} disabled={pending} title="Refresh from Codeforces">
      {pending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
      {label ?? <span className="sr-only">Refresh</span>}
    </Button>
  );
}

export function DeleteContestButton({ id, title, onDeleted }: { id: string; title: string; onDeleted?: () => void }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function remove() {
    setPending(true);
    const r = await api(`/api/contests/${id}`, "DELETE");
    setPending(false);
    if (!r.ok) {
      toast.error("Could not delete", { description: r.error ?? undefined });
      return;
    }
    setOpen(false);
    toast.success(`Removed “${title}”`);
    if (onDeleted) onDeleted();
    else router.refresh();
  }

  return (
    <>
      <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(true)} title="Remove contest" className="text-muted-foreground hover:text-red-300">
        <Trash2 className="size-3.5" aria-hidden />
        <span className="sr-only">Remove</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove this contest?</DialogTitle>
            <DialogDescription>
              “{title}” and its synced results (problems, cells, participation) will be removed from the dashboard. Nothing changes on
              Codeforces, and you can add it again later.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={remove} disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
