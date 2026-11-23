import { BookOpen } from "lucide-react";
import { TimeAgo } from "@/components/client-bits";
import { ImportMasterSheetButton, ManageColumnsButton } from "@/components/homework-dialogs";
import { HomeworkMaster } from "@/components/homework-master";
import { EmptyState, PageHeader, Stat } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { getHomeworkMaster } from "@/lib/queries/homework";

export const metadata = { title: "Homework" };

export default async function HomeworkPage() {
  await verifySession();
  const data = await getHomeworkMaster();
  const { columns, rows } = data;
  const latest = columns[columns.length - 1];
  const lastImport = columns.reduce<Date | null>((m, c) => (c.lastImportedAt && (!m || c.lastImportedAt > m) ? c.lastImportedAt : m), null);
  const done = latest ? rows.filter((r) => (r.scores[latest.id]?.solved ?? 0) >= latest.problemCount).length : 0;
  const zero = latest ? rows.filter((r) => (r.scores[latest.id]?.solved ?? 0) === 0).length : 0;
  const totalSolved = rows.reduce((a, r) => a + columns.reduce((b, c) => b + (r.scores[c.id]?.solved ?? 0), 0), 0);
  const totalProblems = columns.reduce((a, c) => a + c.problemCount, 0) * rows.length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Homework"
        description={
          <>
            Master sheet: one column per homework sheet or contest{lastImport && <> · last imported <TimeAgo date={lastImport} /></>}
          </>
        }
        actions={
          <>
            <ManageColumnsButton columns={columns} />
            <ImportMasterSheetButton />
          </>
        }
      />

      {columns.length === 0 ? (
        <section className="rounded-xl border border-border bg-card/40">
          <EmptyState icon={<BookOpen className="size-6" />} title="No homework columns yet">
            Download the master Google Sheet as CSV (File → Download → Comma-separated values) and use <span className="text-foreground">Import master sheet</span>. Columns
            like <span className="font-mono text-foreground">Sheet #1 (26 Problems)</span> become homework columns and{" "}
            <span className="font-mono text-foreground">Remarks - 28/08</span> become dated remarks.
          </EmptyState>
        </section>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Homework columns" value={columns.length} hint={`${columns.reduce((a, c) => a + c.problemCount, 0)} problems in total`} />
            <Stat label="Overall completion" value={totalProblems ? `${Math.round((totalSolved / totalProblems) * 100)}%` : "—"} hint="all students, all columns" />
            <Stat label={`Finished ${latest.title}`} value={`${done} / ${rows.length}`} tone={done ? "good" : "default"} hint="latest column" />
            <Stat label={`Not started ${latest.title}`} value={zero} tone={zero ? "warn" : "good"} hint="0 solved on the latest column" />
          </div>
          <HomeworkMaster {...data} />
        </>
      )}
    </div>
  );
}
