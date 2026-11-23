import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Small layout primitives shared by every page. */

export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1.5 text-xs text-muted-foreground">{eyebrow}</div>}
        <h1 className="truncate text-2xl font-semibold tracking-tight">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export function Stat({
  label,
  value,
  hint,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "default" | "good" | "warn";
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border border-border bg-card/60 px-4 py-3",
        tone === "warn" && "border-amber-400/25 bg-amber-500/[0.06]",
        tone === "good" && "border-emerald-400/20 bg-emerald-500/[0.05]",
        className,
      )}
    >
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function Panel({ title, description, actions, children, className }: { title?: ReactNode; description?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-xl border border-border bg-card/40", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-medium">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      {icon && <div className="mb-1 text-muted-foreground/60">{icon}</div>}
      <p className="text-sm font-medium">{title}</p>
      {children && <div className="max-w-md text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

export function ErrorBanner({ children }: { children: ReactNode }) {
  return (
    <div role="alert" className="rounded-lg border border-red-400/25 bg-red-500/[0.07] px-4 py-3 text-sm text-red-200">
      {children}
    </div>
  );
}

/** Thin horizontal progress bar with the numbers next to it. */
export function Meter({ value, max, label }: { value: number; max: number; label?: ReactNode }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary/80" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">{label}</span>
    </div>
  );
}

export const th = "px-3 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground";
export const td = "px-3 py-2.5";

/**
 * Frozen table headers: put the table in its own scroll box (sized to the window, so
 * the box scrolls instead of the page) and pin <thead> to its top. The header is opaque
 * and draws its bottom edge as an inset shadow, which (unlike a border) stays visible.
 */
export const tableScroll = "scrollbar-thin overflow-auto";
export const stickyHead = "sticky top-0 z-10 bg-card shadow-[inset_0_-1px_0_var(--border)]";
