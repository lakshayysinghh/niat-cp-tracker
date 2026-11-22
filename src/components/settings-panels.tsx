"use client";

import { KeyRound, Loader2, Plus, Radar, ShieldCheck, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { TimeAgo } from "@/components/client-bits";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------- password

export function PasswordForm() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const f = new FormData(form);
    const next = String(f.get("newPassword") ?? "");
    if (next !== String(f.get("confirm") ?? "")) {
      setError("The new passwords do not match");
      return;
    }
    setPending(true);
    setError(null);
    const r = await api("/api/me/password", "POST", { currentPassword: f.get("currentPassword"), newPassword: next });
    setPending(false);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    form.reset();
    toast.success("Password updated");
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 p-4">
      {[
        ["currentPassword", "Current password", "current-password"],
        ["newPassword", "New password (10+ characters)", "new-password"],
        ["confirm", "Confirm new password", "new-password"],
      ].map(([name, label, ac]) => (
        <div key={name} className="flex flex-col gap-1.5">
          <Label htmlFor={name} className="text-xs">
            {label}
          </Label>
          <Input id={name} name={name} type="password" autoComplete={ac} required minLength={name === "currentPassword" ? 1 : 10} />
        </div>
      ))}
      {error && (
        <p role="alert" className="text-sm text-red-300">
          {error}
        </p>
      )}
      <Button type="submit" disabled={pending} className="self-start">
        {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Update password
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- admins

export interface AdminRow {
  id: string;
  email: string;
  name: string;
  role: "admin" | "instructor";
  lastLoginAt: Date | string | null;
}

export function AdminsPanel({ admins, meId }: { admins: AdminRow[]; meId: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminRow | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const adminCount = admins.filter((a) => a.role === "admin").length;

  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const r = await api<{ admin: AdminRow }>("/api/admins", "POST", {
      email: f.get("email"),
      name: f.get("name"),
      tempPassword: f.get("tempPassword"),
      role: f.get("role"),
    });
    setPending(false);
    if (!r.ok || !r.data) {
      setError(r.error);
      return;
    }
    setAdding(false);
    toast.success(`Added ${r.data.admin.email}`, { description: "Share the temporary password privately; they can change it in Settings." });
    router.refresh();
  }

  async function remove() {
    if (!removing) return;
    setPending(true);
    const r = await api(`/api/admins/${removing.id}`, "DELETE");
    setPending(false);
    if (!r.ok) {
      toast.error("Could not remove", { description: r.error ?? undefined });
      return;
    }
    toast.success(`Removed ${removing.email}`);
    setRemoving(null);
    router.refresh();
  }

  return (
    <>
      <ul className="divide-y divide-border">
        {admins.map((a) => {
          const self = a.id === meId;
          const last = a.role === "admin" && adminCount === 1;
          return (
            <li key={a.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm">{a.email}</span>
                  {self && <span className="rounded bg-primary/15 px-1.5 py-px text-[10px] text-primary">You</span>}
                  <span className="rounded border border-border px-1.5 py-px text-[10px] capitalize text-muted-foreground">{a.role}</span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {a.name} · last login <TimeAgo date={a.lastLoginAt} />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={self || last}
                title={self ? "You cannot remove yourself" : last ? "You cannot remove the last admin" : `Remove ${a.email}`}
                onClick={() => setRemoving(a)}
                className="text-muted-foreground hover:text-red-300"
              >
                <Trash2 className="size-3.5" aria-hidden />
                <span className="sr-only">Remove</span>
              </Button>
            </li>
          );
        })}
      </ul>
      <div className="border-t border-border p-3">
        <Button
          size="sm"
          variant="outline"
          onClick={() => {
            setError(null);
            setAdding(true);
          }}
        >
          <Plus className="size-4" aria-hidden />
          Add admin
        </Button>
      </div>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Add admin</DialogTitle>
            <DialogDescription>They can sign in immediately with the temporary password and change it under Settings.</DialogDescription>
          </DialogHeader>
          <form id="add-admin" onSubmit={add} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-email" className="text-xs">
                Email
              </Label>
              <Input id="a-email" name="email" type="email" required autoFocus />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-name" className="text-xs">
                Name
              </Label>
              <Input id="a-name" name="name" required />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-pw" className="text-xs">
                Temporary password (10+ characters)
              </Label>
              <Input id="a-pw" name="tempPassword" type="text" autoComplete="off" required minLength={10} className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="a-role" className="text-xs">
                Role
              </Label>
              <select id="a-role" name="role" defaultValue="admin" className="h-9 rounded-md border border-input bg-transparent px-2 text-sm">
                <option value="admin">Admin (full access)</option>
                <option value="instructor">Instructor (no deletes or admin management)</option>
              </select>
            </div>
            {error && (
              <p role="alert" className="text-sm text-red-300">
                {error}
              </p>
            )}
          </form>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdding(false)} disabled={pending}>
              Cancel
            </Button>
            <Button type="submit" form="add-admin" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Add admin
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(removing)} onOpenChange={(v) => !v && setRemoving(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove {removing?.email}?</DialogTitle>
            <DialogDescription>They will no longer be able to sign in. Syncs they ran stay in the log.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRemoving(null)} disabled={pending}>
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

// ---------------------------------------------------------------- linked groups

export interface GroupRow {
  groupCode: string;
  autoDiscover: boolean;
  lastDiscoveredAt: Date | string | null;
}

export function GroupsPanel({ groups }: { groups: GroupRow[] }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    setPending("add");
    setError(null);
    const r = await api("/api/groups", "POST", { groupCode: code });
    setPending(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    setCode("");
    toast.success("Group linked", { description: "New contests in it are added on every scheduled run." });
    router.refresh();
  }

  async function toggle(g: GroupRow) {
    setPending(g.groupCode);
    const r = await api("/api/groups", "PATCH", { groupCode: g.groupCode, autoDiscover: !g.autoDiscover });
    setPending(null);
    if (!r.ok) toast.error(r.error ?? "Could not update");
    router.refresh();
  }

  async function unlink(g: GroupRow) {
    setPending(g.groupCode);
    const r = await api("/api/groups", "DELETE", { groupCode: g.groupCode });
    setPending(null);
    if (!r.ok) toast.error(r.error ?? "Could not unlink");
    else toast.success(`Unlinked ${g.groupCode}`, { description: "Contests already tracked stay." });
    router.refresh();
  }

  async function discover() {
    setPending("discover");
    const r = await api<{ added: Array<{ cfContestId: number; title: string }>; errors: Array<{ groupCode: string; error: string }> }>("/api/groups/discover", "POST");
    setPending(null);
    if (!r.ok || !r.data) {
      toast.error("Discovery failed", { description: r.error ?? undefined });
      return;
    }
    if (r.data.errors.length) toast.warning("Some groups could not be read", { description: r.data.errors.map((e) => `${e.groupCode}: ${e.error}`).join("; ") });
    toast.success(r.data.added.length ? `Found ${r.data.added.length} new contest(s)` : "No new contests", {
      description: r.data.added.length ? `${r.data.added.map((a) => a.title).join(", ")}. Press Refresh on each, or wait for the next scheduled run.` : undefined,
    });
    router.refresh();
  }

  return (
    <div className="flex flex-col">
      {groups.length > 0 && (
        <ul className="divide-y divide-border border-b border-border">
          {groups.map((g) => (
            <li key={g.groupCode} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <a href={`https://codeforces.com/group/${g.groupCode}/contests`} target="_blank" rel="noreferrer" className="font-mono text-sm hover:text-primary">
                  {g.groupCode}
                </a>
                <div className="text-xs text-muted-foreground">
                  last checked <TimeAgo date={g.lastDiscoveredAt} />
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
                <input type="checkbox" checked={g.autoDiscover} disabled={pending === g.groupCode} onChange={() => toggle(g)} className="size-3.5 accent-emerald-400" />
                Auto-add
              </label>
              <Button variant="ghost" size="sm" onClick={() => unlink(g)} disabled={pending === g.groupCode} title={`Unlink ${g.groupCode}`} className="text-muted-foreground hover:text-red-300">
                <Trash2 className="size-3.5" aria-hidden />
                <span className="sr-only">Unlink</span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={add} className="flex flex-col gap-2 p-4">
        <Label htmlFor="group" className="text-xs">
          Link a group (code or link)
        </Label>
        <div className="flex gap-2">
          <Input id="group" value={code} onChange={(e) => setCode(e.target.value)} placeholder="vP4zGe21UV" className="font-mono" />
          <Button type="submit" variant="outline" disabled={!code.trim() || pending !== null}>
            {pending === "add" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
            Link
          </Button>
        </div>
        {error && (
          <p role="alert" className="text-sm text-red-300">
            {error}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Each scheduled run adds new contests from linked groups. Tick <span className="text-foreground">Manager</span> on new contests on Codeforces so the API can read them.
        </p>
        {groups.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={discover} disabled={pending !== null} className="self-start">
            {pending === "discover" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Radar className="size-4" aria-hidden />}
            Check for new contests now
          </Button>
        )}
      </form>
    </div>
  );
}

// ---------------------------------------------------------------- key check

export function KeyCheckButton() {
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  async function check() {
    setPending(true);
    const r = await api<{ ok: boolean; keyHandle: string; latencyMs: number }>("/api/settings/cf-check", "POST");
    setPending(false);
    setResult(r.ok && r.data ? { ok: true, text: `Key works · ${r.data.keyHandle} · ${r.data.latencyMs} ms` } : { ok: false, text: r.error ?? "Check failed" });
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button variant="outline" size="sm" onClick={check} disabled={pending}>
        {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <KeyRound className="size-4" aria-hidden />}
        Check Codeforces key
      </Button>
      {result && (
        <span className={cn("inline-flex items-center gap-1.5 text-xs", result.ok ? "text-emerald-300" : "text-red-300")}>
          {result.ok && <ShieldCheck className="size-3.5" aria-hidden />}
          {result.text}
        </span>
      )}
    </div>
  );
}
