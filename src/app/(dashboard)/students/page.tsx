import { AddStudentButton, ImportStudentsButton, SampleCsvButton, VerifyHandlesButton } from "@/components/student-dialogs";
import { StudentsTable } from "@/components/students-table";
import { PageHeader } from "@/components/ui-kit";
import { verifySession } from "@/lib/auth";
import { listRoster } from "@/lib/queries/students";

export const metadata = { title: "Students" };

export default async function StudentsPage() {
  await verifySession();
  const { rows } = await listRoster();
  const issues = rows.filter((r) => r.handleStatus !== "VALID").length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Students"
        description={
          <>
            {rows.length} in Batch 1
            {issues > 0 && <span className="text-amber-300"> · {issues} handle issue{issues === 1 ? "" : "s"}</span>}
          </>
        }
        actions={
          <>
            <SampleCsvButton />
            <VerifyHandlesButton />
            <ImportStudentsButton />
            <AddStudentButton />
          </>
        }
      />
      <StudentsTable rows={rows} />
    </div>
  );
}
