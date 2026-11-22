import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto mt-16 flex max-w-md flex-col items-center gap-2 text-center">
      <h2 className="font-medium">Not found</h2>
      <p className="text-sm text-muted-foreground">That contest or student is not in this batch. It may have been removed or renamed.</p>
      <Link href="/" className="mt-2 text-sm text-primary hover:underline">
        Back to contests
      </Link>
    </div>
  );
}
