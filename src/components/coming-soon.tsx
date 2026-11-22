import type { ReactNode } from "react";

/** Placeholder empty state for screens that arrive in later phases. */
export function ComingSoon({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
      <div className="mt-4 rounded-lg border border-dashed border-border p-8 text-sm text-muted-foreground">
        {children}
      </div>
    </section>
  );
}
