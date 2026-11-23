"use client";

import { ArrowDown, ArrowUp, ExternalLink, FileUp, Link2, Loader2, Settings2, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import type { HomeworkColumnView } from "@/lib/queries/homework";
import { cn } from "@/lib/utils";

export const DEFAULT_HOMEWORK_GROUP = "MWSDmqGsZm";

export function columnUrl(c: Pick<HomeworkColumnView, "groupCode" | "cfContestId">): string | null {
  if (!c.cfContestId) return null;
  return c.groupCode ? `https://codeforces.com/group/${c.groupCode}/contest/${c.cfContestId}` : `https://codeforces.com/gym/${c.cfContestId}`;
}

// ---------------------------------------------------------------- import

interface Preview {
  columns: Array<{ title: string; problemCount: number; status: "new" | "existing" | "count-changed"; previousCount?: number }>;
  remarkDates: string[];
  matched: Array<{ row: number; niatId: string; name: string | null; matchedBy: string }>;
  unmatched: Array<{ row: number; name: string | null; handle: string | null; reason: string }>;
  rowWarnings: Array<{ row: number; name: string | null; warning: string }>;
  warnings: string[];
  scoreCount: number;
  remarkCount: number;
}

export function ImportMasterSheetButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [done, setDone] = useState<{ columnsCreated: number; columnsUpdated: number; scores: number; remarks: number; studentsMatched: number } | null>(null);
  const [pending, setPending] = useState<null | "preview" | "commit">(null);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setCsv("");
    setFileName(null);
    setPreview(null);
    setDone(null);
    setError(null);
  }

  async function run(dryRun: boolean) {
    setPending(dryRun ? "preview" : "commit");
    setError(null);
    const r = await api<{ preview: Preview; result?: typeof done }>("/api/homework/import", "POST", { csv, dryRun });
    setPending(null);
    if (!r.ok || !r.data) {
      setError(r.error);
      return;
    }
    if (dryRun) setPreview(r.data.preview);
    else {
      setDone(r.data.result ?? null);
      router.refresh();
    }
  }

  return (
    <>
      <Button
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload className="size-4" aria-hidden />
        Import master sheet
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import master sheet</DialogTitle>
            <DialogDescription>
              In Google Sheets: File → Download → Comma-separated values. Columns like <span className="text-foreground">Sheet #1 (26 Problems)</span> become homework
              columns; <span className="text-foreground">Remarks - 28/08</span> become dated remarks. <span className="text-foreground">#N/A</span> and blanks count as 0.
              Re-importing updates scores; nothing is deleted.
            </DialogDescription>
          </DialogHeader>

          {done ? (
            <div className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
              {[
                ["Students matched", done.studentsMatched],
                ["New columns", done.columnsCreated],
                ["Scores saved", done.scores],
                ["Remarks saved", done.remarks],
              ].map(([l, v]) => (
                <div key={l as string} className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">{l}</div>
                  <div className="text-lg font-semibold tabular-nums">{v}</div>
                </div>
              ))}
            </div>
          ) : preview ? (
            <div className="flex max-h-[60vh] flex-col gap-4 overflow-y-auto pr-1 text-sm">
              <p>
                <span className="font-medium">{preview.matched.length}</span> students matched ·{" "}
                <span className="font-medium">{preview.columns.filter((c) => c.status === "new").length}</span> new columns ·{" "}
                <span className="font-medium">{preview.scoreCount}</span> scores · <span className="font-medium">{preview.remarkCount}</span> remarks
                {preview.unmatched.length > 0 && <span className="text-amber-300"> · {preview.unmatched.length} rows not matched</span>}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {preview.columns.map((c) => (
                  <span
                    key={c.title}
                    className={cn(
                      "rounded-md border px-2 py-0.5 text-xs",
                      c.status === "new" ? "border-emerald-400/30 text-emerald-200" : c.status === "count-changed" ? "border-amber-400/30 text-amber-200" : "border-border text-muted-foreground",
                    )}
                    title={c.status === "count-changed" ? `Problem count changes from ${c.previousCount} to ${c.problemCount}` : undefined}
                  >
                    {c.status === "new" ? "+ " : ""}
                    {c.title} · {c.problemCount}
                    {c.status === "count-changed" && ` (was ${c.previousCount})`}
                  </span>
                ))}
              </div>
              {preview.remarkDates.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  Remark dates: {preview.remarkDates.map((d) => d.slice(8, 10) + "/" + d.slice(5, 7)).join(", ")}
                </p>
              )}
              {[...preview.warnings].length > 0 && (
                <ul className="list-inside list-disc text-xs text-amber-200">
                  {preview.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
              {preview.unmatched.length > 0 && (
                <div className="rounded-lg border border-amber-400/20 bg-amber-500/[0.05] p-3">
                  <p className="mb-1.5 text-xs font-medium text-amber-200">Rows not matched to a student (skipped)</p>
                  <ul className="space-y-1 text-xs text-amber-100/90">
                    {preview.unmatched.map((u) => (
                      <li key={u.row}>
                        Row {u.row}
                        {u.name ? ` · ${u.name}` : ""}
                        {u.handle ? ` · ${u.handle}` : ""}: {u.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {preview.rowWarnings.length > 0 && (
                <div className="rounded-lg border border-border p-3">
                  <p className="mb-1.5 text-xs font-medium">Cells skipped</p>
                  <ul className="space-y-1 text-xs text-muted-foreground">
                    {preview.rowWarnings.map((w, i) => (
                      <li key={i}>
                        Row {w.row}
                        {w.name ? ` · ${w.name}` : ""}: {w.warning}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <input
                  ref={fileRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (!f) return;
                    if (f.size > 2_000_000) return setError("File is larger than 2 MB");
                    setCsv(await f.text());
                    setFileName(f.name);
                    setError(null);
                  }}
                />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <FileUp className="size-4" aria-hidden />
                  Choose CSV
                </Button>
                <span className="text-xs text-muted-foreground">{fileName ?? "or paste the sheet below (copy cells in Google Sheets, paste here)"}</span>
              </div>
              <Textarea
                value={csv}
                onChange={(e) => {
                  setCsv(e.target.value);
                  setFileName(null);
                }}
                placeholder={"Sr no,Name,Codeforces Username,Phone,College,CF Link,Sheet #1 (26 Problems),Remarks - 28/08\n1,…"}
                className="h-40 font-mono text-xs"
              />
            </div>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-300">
              {error}
            </p>
          )}
          <DialogFooter>
            {done ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : preview ? (
              <>
                <Button variant="outline" onClick={() => setPreview(null)} disabled={pending !== null}>
                  Back
                </Button>
                <Button onClick={() => run(false)} disabled={pending !== null || preview.matched.length === 0}>
                  {pending === "commit" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Import {preview.matched.length} students
                </Button>
              </>
            ) : (
              <>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={() => run(true)} disabled={pending !== null || !csv.trim()}>
                  {pending === "preview" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  Preview
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- manage columns

interface GroupContest {
  cfContestId: number;
  name: string;
}

export function ManageColumnsButton({ columns }: { columns: HomeworkColumnView[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [order, setOrder] = useState<HomeworkColumnView[]>(columns);
  const [edits, setEdits] = useState<Record<string, { title: string; problemCount: string; cfContestId: string }>>({});
  const [group, setGroup] = useState(DEFAULT_HOMEWORK_GROUP);
  const [contests, setContests] = useState<GroupContest[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  function openDialog() {
    setOrder(columns);
    setEdits(Object.fromEntries(columns.map((c) => [c.id, { title: c.title, problemCount: String(c.problemCount), cfContestId: c.cfContestId ? String(c.cfContestId) : "" }])));
    setGroup(columns.find((c) => c.groupCode)?.groupCode ?? DEFAULT_HOMEWORK_GROUP);
    setOpen(true);
  }

  async function loadContests() {
    setPending("load");
    const r = await api<{ contests: GroupContest[] }>(`/api/homework/group-contests?groupCode=${encodeURIComponent(group)}`, "GET");
    setPending(null);
    if (!r.ok || !r.data) return toast.error("Could not list the group's contests", { description: r.error ?? undefined });
    setContests(r.data.contests);
    // Suggest links by number: "Sheet #3" <-> "Sheet #3 (Arrays)", "Contest #3.1" <-> "Contest #3.1".
    const key = (s: string) => s.toLowerCase().match(/(sheet|contest)\s*#?\s*(\d+(?:\.\d+)?)/)?.slice(1, 3).join(" ");
    setEdits((prev) => {
      const next = { ...prev };
      for (const c of order) {
        if (next[c.id]?.cfContestId) continue;
        const k = key(c.title);
        const hit = k ? r.data!.contests.find((x) => key(x.name) === k) : undefined;
        if (hit) next[c.id] = { ...next[c.id], cfContestId: String(hit.cfContestId) };
      }
      return next;
    });
  }

  function move(i: number, d: -1 | 1) {
    setOrder((o) => {
      const n = [...o];
      [n[i], n[i + d]] = [n[i + d], n[i]];
      return n;
    });
  }

  async function saveAll() {
    setPending("save");
    let failed = 0;
    for (const c of order) {
      const e = edits[c.id];
      if (!e) continue;
      const patch: Record<string, unknown> = {};
      if (e.title.trim() && e.title.trim() !== c.title) patch.title = e.title.trim();
      const n = Number(e.problemCount);
      if (Number.isInteger(n) && n > 0 && n !== c.problemCount) patch.problemCount = n;
      const cid = e.cfContestId ? Number(e.cfContestId) : null;
      if (cid !== c.cfContestId) {
        patch.cfContestId = cid;
        patch.groupCode = cid ? group : null;
      }
      if (Object.keys(patch).length) {
        const r = await api(`/api/homework/columns/${c.id}`, "PATCH", patch);
        if (!r.ok) {
          failed++;
          toast.error(`${c.title}: ${r.error}`);
        }
      }
    }
    if (order.map((c) => c.id).join() !== columns.map((c) => c.id).join()) {
      const r = await api("/api/homework/reorder", "PATCH", { ids: order.map((c) => c.id) });
      if (!r.ok) failed++;
    }
    setPending(null);
    if (!failed) {
      toast.success("Columns saved");
      setOpen(false);
    }
    router.refresh();
  }

  async function remove(c: HomeworkColumnView) {
    setPending(c.id);
    const r = await api(`/api/homework/columns/${c.id}`, "DELETE");
    setPending(null);
    if (!r.ok) return toast.error("Could not delete", { description: r.error ?? undefined });
    setOrder((o) => o.filter((x) => x.id !== c.id));
    toast.success(`Deleted “${c.title}” and its scores`);
    router.refresh();
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={openDialog} disabled={columns.length === 0}>
        <Settings2 className="size-4" aria-hidden />
        Manage columns
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Manage homework columns</DialogTitle>
            <DialogDescription>Rename, fix problem counts, reorder, and link each column to its Codeforces contest so the header opens it.</DialogDescription>
          </DialogHeader>

          <div className="flex flex-wrap items-end gap-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="hw-group" className="text-xs">
                Codeforces group
              </Label>
              <Input id="hw-group" value={group} onChange={(e) => setGroup(e.target.value)} className="h-8 w-48 font-mono" />
            </div>
            <Button variant="outline" size="sm" onClick={loadContests} disabled={pending !== null || !group.trim()}>
              {pending === "load" ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Link2 className="size-4" aria-hidden />}
              Load contests &amp; suggest links
            </Button>
            {contests && <span className="pb-2 text-xs text-muted-foreground">{contests.length} contests found</span>}
          </div>

          <div className="scrollbar-thin max-h-[50vh] overflow-y-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-popover text-xs text-muted-foreground">
                <tr>
                  <th className="w-16 px-2 py-2 text-left font-medium">Order</th>
                  <th className="px-2 py-2 text-left font-medium">Title</th>
                  <th className="w-20 px-2 py-2 text-left font-medium">Problems</th>
                  <th className="px-2 py-2 text-left font-medium">Codeforces contest</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {order.map((c, i) => {
                  const e = edits[c.id] ?? { title: c.title, problemCount: String(c.problemCount), cfContestId: "" };
                  const set = (patch: Partial<typeof e>) => setEdits((p) => ({ ...p, [c.id]: { ...e, ...patch } }));
                  return (
                    <tr key={c.id}>
                      <td className="px-2 py-1.5">
                        <div className="flex">
                          <Button variant="ghost" size="icon-sm" disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move ${c.title} left`}>
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button variant="ghost" size="icon-sm" disabled={i === order.length - 1} onClick={() => move(i, 1)} aria-label={`Move ${c.title} right`}>
                            <ArrowDown className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={e.title} onChange={(ev) => set({ title: ev.target.value })} className="h-8" aria-label="Title" />
                      </td>
                      <td className="px-2 py-1.5">
                        <Input value={e.problemCount} onChange={(ev) => set({ problemCount: ev.target.value })} inputMode="numeric" className="h-8 w-16" aria-label="Problems" />
                      </td>
                      <td className="px-2 py-1.5">
                        {contests ? (
                          <select value={e.cfContestId} onChange={(ev) => set({ cfContestId: ev.target.value })} className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-xs" aria-label="Codeforces contest">
                            <option value="">Not linked</option>
                            {contests.map((x) => (
                              <option key={x.cfContestId} value={x.cfContestId}>
                                {x.name} · {x.cfContestId}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="text-xs text-muted-foreground">{c.cfContestId ? `${c.groupCode ?? "gym"} / ${c.cfContestId}` : "Not linked · load contests"}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <Button variant="ghost" size="icon-sm" onClick={() => remove(c)} disabled={pending !== null} aria-label={`Delete ${c.title}`} className="text-muted-foreground hover:text-red-300">
                          {pending === c.id ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={pending !== null}>
              Cancel
            </Button>
            <Button onClick={saveAll} disabled={pending !== null}>
              {pending === "save" && <Loader2 className="size-4 animate-spin" aria-hidden />}
              Save changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------- score editor

export function ScoreDialog({
  open,
  onOpenChange,
  column,
  student,
  current,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  column: HomeworkColumnView;
  student: { id: string; name: string | null; cfHandle: string };
  current: { solved: number; source: "IMPORT" | "MANUAL"; updatedAt: Date | string } | undefined;
}) {
  const router = useRouter();
  const [value, setValue] = useState(String(current?.solved ?? 0));
  const [pending, setPending] = useState(false);
  const url = columnUrl(column);
  const n = Number(value);
  const valid = Number.isInteger(n) && n >= 0 && n <= column.problemCount;

  async function save() {
    setPending(true);
    const r = await api("/api/homework/scores", "PUT", { columnId: column.id, studentId: student.id, solved: n });
    setPending(false);
    if (!r.ok) return toast.error("Could not save", { description: r.error ?? undefined });
    toast.success(`${student.name ?? student.cfHandle}: ${n} / ${column.problemCount} on ${column.title}`);
    onOpenChange(false);
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{column.title}</DialogTitle>
          <DialogDescription>
            {student.name ?? student.cfHandle} · {current ? `${current.source === "MANUAL" ? "edited by hand" : "from the master sheet"} ${new Date(current.updatedAt).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" })}` : "no score yet (counts as 0)"}
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-end gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="score" className="text-xs">
              Problems solved
            </Label>
            <div className="flex items-center gap-2">
              <Input id="score" value={value} onChange={(e) => setValue(e.target.value)} inputMode="numeric" className="h-9 w-20 text-base tabular-nums" autoFocus />
              <span className="text-sm text-muted-foreground">/ {column.problemCount}</span>
            </div>
          </div>
          {url && (
            <a href={`${url}/standings`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 pb-2 text-xs text-muted-foreground hover:text-foreground">
              Check standings on Codeforces
              <ExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">The next master-sheet import overwrites this value, so update the sheet too.</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button onClick={save} disabled={pending || !valid}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
