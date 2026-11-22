"use client";

import { Pencil } from "lucide-react";
import { useState } from "react";
import { StudentFormDialog, type EditableStudent } from "@/components/student-dialogs";
import { Button } from "@/components/ui/button";

export function EditStudentButton({ student }: { student: EditableStudent }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil className="size-3.5" aria-hidden />
        Edit
      </Button>
      {open && <StudentFormDialog open={open} onOpenChange={setOpen} student={student} />}
    </>
  );
}
