"use client";

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function DashboardError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const db = /DATABASE_URL|neon|fetch failed|ECONN|timeout/i.test(error.message);
  return (
    <div role="alert" className="mx-auto mt-16 flex max-w-lg flex-col items-center gap-3 rounded-xl border border-red-400/25 bg-red-500/[0.06] p-8 text-center">
      <AlertTriangle className="size-6 text-red-300" aria-hidden />
      <h2 className="font-medium">This page could not load</h2>
      <p className="text-sm text-muted-foreground">
        {db
          ? "The database did not respond. Neon may be waking up from sleep; try again in a few seconds."
          : "Something went wrong while loading this page. Try again; if it keeps failing, check the server logs."}
      </p>
      {error.digest && <p className="font-mono text-[11px] text-muted-foreground">ref {error.digest}</p>}
      <Button variant="outline" size="sm" onClick={reset}>
        Try again
      </Button>
    </div>
  );
}
