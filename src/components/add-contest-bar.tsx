"use client";

import { ChevronDown, Link2, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

type Mode = "AUTO" | "MANAGER" | "MEMBER";

export function AddContestBar() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("AUTO");
  const [advanced, setAdvanced] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    setPending(true);
    setError(null);
    const r = await api<{ contest: { title: string; lastSyncError: string | null }; sync: { ok: boolean; participants?: number; error?: string } }>(
      "/api/contests",
      "POST",
      { url: url.trim(), accessMode: mode },
    );
    setPending(false);
    if (!r.ok || !r.data) {
      setError(r.error);
      return;
    }
    setUrl("");
    if (r.data.sync.ok) toast.success(`Added “${r.data.contest.title}”`, { description: `${r.data.sync.participants} participants synced` });
    else toast.warning("Contest saved, but the first sync failed", { description: r.data.sync.error });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-card/40 p-3">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://codeforces.com/group/vP4zGe21UV/contest/734032"
            aria-label="Codeforces contest URL"
            className="h-9 pl-9 font-mono text-[13px]"
            disabled={pending}
          />
        </div>
        <Button type="submit" disabled={pending || !url.trim()} className="h-9 px-4">
          {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
          {pending ? "Syncing…" : "Add & Sync"}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
        <button type="button" onClick={() => setAdvanced((v) => !v)} className="inline-flex items-center gap-1 hover:text-foreground" aria-expanded={advanced}>
          <ChevronDown className={cn("size-3.5 transition-transform", advanced && "rotate-180")} aria-hidden />
          Advanced
        </button>
        {advanced && (
          <label className="inline-flex items-center gap-2">
            Access mode
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as Mode)}
              className="h-7 rounded-md border border-input bg-transparent px-2 text-xs text-foreground"
            >
              <option value="AUTO">Auto (manager, then member)</option>
              <option value="MANAGER">Manager</option>
              <option value="MEMBER">Member</option>
            </select>
          </label>
        )}
        {error && (
          <span role="alert" className="text-red-300">
            {error}
          </span>
        )}
      </div>
    </form>
  );
}
