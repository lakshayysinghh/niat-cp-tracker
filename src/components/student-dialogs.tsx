"use client";

import { Download, FileUp, Loader2, Plus, ShieldCheck, Upload } from "lucide-react";
import { useRouter } from "next/navigation";
import { useRef, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api-client";
import { cn } from "@/lib/utils";

interface Verification {
  valid: number;
  invalid: string[];
  renamed?: Array<{ from: string; to: string }>;
  error?: string;
}

function verificationToast(v: Verification | undefined) {
  if (!v) return;
  if (v.error) toast.warning("Saved, but handles could not be verified yet", { description: v.error });
  else if (v.invalid.length) toast.warning(`${v.invalid.length} handle(s) not found on Codeforces`, { description: v.invalid.join(", ") });
}

// ---------------------------------------------------------------- add / edit

export interface EditableStudent {
  id: string;
  niatId: string;
  name: string | null;
  college: string | null;
  phone: string;
  enteredHandle: string;
  cfHandle: string;
}

function Field({ id, label, hint, children }: { id: string; label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-xs">
        {label}
      </Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StudentFormDialog({
  open,
  onOpenChange,
  student,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  student?: EditableStudent;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editing = Boolean(student);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const values = {
      niatId: String(f.get("niatId") ?? ""),
      name: String(f.get("name") ?? ""),
      college: String(f.get("college") ?? ""),
      phone: String(f.get("phone") ?? ""),
      cfHandle: String(f.get("cfHandle") ?? ""),
    };
    setPending(true);
    setError(null);
    let r;
    if (student) {
      const patch: Record<string, string> = {};
      if (values.niatId.trim().toUpperCase() !== student.niatId) patch.niatId = values.niatId;
      if (values.name.trim() !== (student.name ?? "")) patch.name = values.name;
      if (values.college.trim() !== (student.college ?? "")) patch.college = values.college;
      if (values.phone.trim() !== student.phone) patch.phone = values.phone;
      if (values.cfHandle.trim() !== student.enteredHandle && values.cfHandle.trim() !== student.cfHandle) patch.cfHandle = values.cfHandle;
      if (Object.keys(patch).length === 0) {
        setPending(false);
        onOpenChange(false);
        return;
      }
      r = await api<{ student: { niatId: string }; verification?: Verification }>(`/api/students/${student.id}`, "PATCH", patch);
    } else {
      r = await api<{ student: { niatId: string }; verification?: Verification }>("/api/students", "POST", values);
    }
    setPending(false);
    if (!r.ok || !r.data) {
      setError(r.error);
      return;
    }
    onOpenChange(false);
    toast.success(editing ? `Saved ${r.data.student.niatId}` : `Added ${r.data.student.niatId}`);
    verificationToast(r.data.verification);
    if (student && r.data.student.niatId !== student.niatId && window.location.pathname.startsWith("/students/")) {
      router.replace(`/students/${encodeURIComponent(r.data.student.niatId)}`);
    }
    router.refresh();
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>
            {editing ? "Changing the handle re-verifies it on Codeforces." : "The handle is verified on Codeforces when you save."}
          </DialogDescription>
        </DialogHeader>
        <form id="student-form" onSubmit={submit} className="grid grid-cols-2 gap-3">
          <Field id="niatId" label="NIAT ID" hint={editing ? "Replace a TBD- placeholder with the real ID" : undefined}>
            <Input id="niatId" name="niatId" defaultValue={student?.niatId} required className="font-mono" autoFocus={!editing} />
          </Field>
          <Field id="phone" label="Phone">
            <Input id="phone" name="phone" defaultValue={student?.phone} required inputMode="tel" />
          </Field>
          <div className="col-span-2">
            <Field id="name" label="Name">
              <Input id="name" name="name" defaultValue={student?.name ?? ""} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field id="college" label="College">
              <Input id="college" name="college" defaultValue={student?.college ?? ""} />
            </Field>
          </div>
          <div className="col-span-2">
            <Field id="cfHandle" label="Codeforces handle" hint="A handle, @handle or profile link">
              <Input id="cfHandle" name="cfHandle" defaultValue={student?.cfHandle} required className="font-mono" />
            </Field>
          </div>
          {error && (
            <p role="alert" className="col-span-2 text-sm text-red-300">
              {error}
            </p>
          )}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancel
          </Button>
          <Button type="submit" form="student-form" disabled={pending}>
            {pending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {editing ? "Save" : "Add student"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AddStudentButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" aria-hidden />
        Add student
      </Button>
      {open && <StudentFormDialog open={open} onOpenChange={setOpen} />}
    </>
  );
}

// ---------------------------------------------------------------- verify / sample

export function VerifyHandlesButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  async function run() {
    setPending(true);
    const r = await api<{ checked: number; valid: number; invalid: string[]; renamed: Array<{ from: string; to: string }> }>("/api/students/verify-handles", "POST", {});
    setPending(false);
    if (!r.ok || !r.data) {
      toast.error("Verification failed", { description: r.error ?? undefined });
      return;
    }
    const d = r.data;
    if (d.checked === 0) toast.success("Every handle is already verified");
    else
      toast.success(`Checked ${d.checked} handle(s)`, {
        description: [`${d.valid} valid`, d.invalid.length ? `not found: ${d.invalid.join(", ")}` : "", d.renamed.length ? `renamed: ${d.renamed.map((x) => `${x.from} → ${x.to}`).join(", ")}` : ""]
          .filter(Boolean)
          .join(" · "),
      });
    router.refresh();
  }
  return (
    <Button variant="outline" size="sm" onClick={run} disabled={pending} title="Check every handle that is not verified yet">
      {pending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShieldCheck className="size-4" aria-hidden />}
      Verify handles
    </Button>
  );
}

const SAMPLE = `niat_id,phone,cf_handle,name,college
NIAT2026001,+919876543210,tourist,Aarav Sharma,NIAT - KKH
NIAT2026002,98765 43211,Benq,Diya Patel,NIAT - KKH
NIAT2026003,09123456789,https://codeforces.com/profile/jiangly,Rohan Verma,
NIAT2026004,919988776655,@ecnerwala,,
`;

export function downloadSampleCsv() {
  const blob = new Blob([SAMPLE], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "students_template.csv";
  a.click();
  URL.revokeObjectURL(a.href);
}

export function SampleCsvButton() {
  return (
    <Button variant="ghost" size="sm" onClick={downloadSampleCsv}>
      <Download className="size-4" aria-hidden />
      Sample CSV
    </Button>
  );
}

// ---------------------------------------------------------------- import

interface PreviewRow {
  row: number;
  niatId: string;
  phone: string;
  cfHandle: string;
  name: string | null;
  college: string | null;
  action: "insert" | "update" | "unchanged";
  handleChanged: boolean;
}
interface Failure {
  row: number;
  niatId?: string;
  reason: string;
}

export function ImportStudentsButton() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [csv, setCsv] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, setPending] = useState<null | "preview" | "commit">(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ preview: PreviewRow[]; failed: Failure[] } | null>(null);
  const [result, setResult] = useState<{ inserted: number; updated: number; unchanged: number; failed: Failure[]; verification: Verification } | null>(null);

  function reset() {
    setCsv("");
    setFileName(null);
    setPreview(null);
    setResult(null);
    setError(null);
  }

  async function loadFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 1_000_000) {
      setError("File is larger than 1 MB");
      return;
    }
    setCsv(await file.text());
    setFileName(file.name);
    setPreview(null);
    setError(null);
  }

  async function run(dryRun: boolean) {
    setPending(dryRun ? "preview" : "commit");
    setError(null);
    const r = await api<{ preview: PreviewRow[]; failed: Failure[]; inserted: number; updated: number; unchanged: number; verification: Verification }>(
      "/api/students/import",
      "POST",
      { csv, dryRun },
    );
    setPending(null);
    if (!r.ok || !r.data) {
      setError(r.error);
      return;
    }
    if (dryRun) setPreview({ preview: r.data.preview, failed: r.data.failed });
    else {
      setResult({ inserted: r.data.inserted, updated: r.data.updated, unchanged: r.data.unchanged, failed: r.data.failed, verification: r.data.verification });
      router.refresh();
    }
  }

  const changes = preview ? preview.preview.filter((p) => p.action !== "unchanged").length : 0;

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        <Upload className="size-4" aria-hidden />
        Import CSV
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Import students</DialogTitle>
            <DialogDescription>
              Columns: niat_id, phone, cf_handle, name, college. Import only adds and updates; nobody is deleted. Review the preview before anything is saved.
            </DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="flex flex-col gap-3 text-sm">
              <div className="grid grid-cols-3 gap-2">
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Added</div>
                  <div className="text-lg font-semibold tabular-nums">{result.inserted}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Updated</div>
                  <div className="text-lg font-semibold tabular-nums">{result.updated}</div>
                </div>
                <div className="rounded-lg border border-border p-3">
                  <div className="text-xs text-muted-foreground">Handles verified</div>
                  <div className="text-lg font-semibold tabular-nums">{result.verification.valid}</div>
                </div>
              </div>
              {result.verification.invalid.length > 0 && (
                <p className="text-amber-300">Not found on Codeforces: {result.verification.invalid.join(", ")}. Fix them from the roster.</p>
              )}
              {result.verification.error && <p className="text-amber-300">Verification did not run: {result.verification.error}. Use “Verify handles” later.</p>}
              {result.failed.length > 0 && <FailureList failed={result.failed} />}
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={(e) => loadFile(e.target.files?.[0])} />
                <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
                  <FileUp className="size-4" aria-hidden />
                  Choose file
                </Button>
                <span className="text-xs text-muted-foreground">{fileName ?? "or paste CSV below"}</span>
                <button type="button" onClick={downloadSampleCsv} className="ml-auto text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline">
                  Download sample
                </button>
              </div>
              {!preview && (
                <Textarea
                  value={csv}
                  onChange={(e) => {
                    setCsv(e.target.value);
                    setFileName(null);
                  }}
                  placeholder={"niat_id,phone,cf_handle,name,college\nN24H01A0001,9876543210,tourist,Student Name,NIAT - KKH"}
                  className="h-40 font-mono text-xs"
                />
              )}
              {preview && (
                <div className="flex flex-col gap-3">
                  <p className="text-sm">
                    <span className="font-medium">{preview.preview.filter((p) => p.action === "insert").length}</span> new ·{" "}
                    <span className="font-medium">{preview.preview.filter((p) => p.action === "update").length}</span> updated ·{" "}
                    <span className="text-muted-foreground">{preview.preview.filter((p) => p.action === "unchanged").length} unchanged</span>
                    {preview.failed.length > 0 && <span className="text-red-300"> · {preview.failed.length} rejected</span>}
                  </p>
                  <div className="scrollbar-thin max-h-64 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-popover text-muted-foreground">
                        <tr>
                          {["Row", "NIAT ID", "Name", "Phone", "Handle", ""].map((h) => (
                            <th key={h} className="px-2 py-1.5 text-left font-medium">
                              {h}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {preview.preview.map((p) => (
                          <tr key={p.row} className={cn(p.action === "unchanged" && "text-muted-foreground")}>
                            <td className="px-2 py-1 tabular-nums">{p.row}</td>
                            <td className="px-2 py-1 font-mono">{p.niatId}</td>
                            <td className="px-2 py-1">{p.name ?? "—"}</td>
                            <td className="px-2 py-1 tabular-nums">{p.phone}</td>
                            <td className="px-2 py-1 font-mono">{p.cfHandle}</td>
                            <td className="px-2 py-1">
                              <span className={cn(p.action === "insert" && "text-emerald-300", p.action === "update" && "text-sky-300")}>
                                {p.action === "insert" ? "new" : p.action === "update" ? (p.handleChanged ? "update · new handle" : "update") : "unchanged"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {preview.failed.length > 0 && <FailureList failed={preview.failed} />}
                </div>
              )}
              {error && (
                <p role="alert" className="text-sm text-red-300">
                  {error}
                </p>
              )}
            </div>
          )}

          <DialogFooter>
            {result ? (
              <Button onClick={() => setOpen(false)}>Done</Button>
            ) : preview ? (
              <>
                <Button variant="outline" onClick={() => setPreview(null)} disabled={pending !== null}>
                  Back
                </Button>
                <Button onClick={() => run(false)} disabled={pending !== null || changes === 0}>
                  {pending === "commit" && <Loader2 className="size-4 animate-spin" aria-hidden />}
                  {changes === 0 ? "Nothing to import" : `Import ${changes} student${changes === 1 ? "" : "s"}`}
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

function FailureList({ failed }: { failed: Failure[] }) {
  return (
    <div className="rounded-lg border border-red-400/20 bg-red-500/[0.05] p-3">
      <p className="mb-1.5 text-xs font-medium text-red-200">Rejected rows (not imported)</p>
      <ul className="scrollbar-thin max-h-32 space-y-1 overflow-auto text-xs text-red-200/90">
        {failed.map((f) => (
          <li key={`${f.row}-${f.reason}`}>
            Row {f.row}
            {f.niatId ? ` (${f.niatId})` : ""}: {f.reason}
          </li>
        ))}
      </ul>
    </div>
  );
}
