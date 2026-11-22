"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";
import { formatDateTimeIST, relativeTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** "12 min ago" with the exact IST time in the tooltip. */
export function TimeAgo({ date, className }: { date: Date | string | null; className?: string }) {
  return (
    <time
      suppressHydrationWarning
      dateTime={date ? new Date(date).toISOString() : undefined}
      title={formatDateTimeIST(date)}
      className={className}
    >
      {relativeTime(date)}
    </time>
  );
}

export function CopyButton({ value, label, className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(value).catch(() => undefined);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }}
      title={copied ? "Copied" : `Copy ${label ?? value}`}
      aria-label={`Copy ${label ?? value}`}
      className={cn("group inline-flex items-center gap-1.5 rounded text-left hover:text-foreground", className)}
    >
      {label && <span className="tabular-nums">{label}</span>}
      {copied ? (
        <Check className="size-3.5 text-emerald-400" aria-hidden />
      ) : (
        <Copy className="size-3.5 opacity-0 transition-opacity group-hover:opacity-60" aria-hidden />
      )}
    </button>
  );
}
