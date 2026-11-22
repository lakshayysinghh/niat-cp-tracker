import { useId } from "react";
import { cn } from "@/lib/utils";

/**
 * CP Tracker mark: a code chevron (‹) and a rising rating line that ends in a
 * glowing point, on a dark tile with an emerald edge. Crisp from 16 px upward.
 */
export function LogoMark({ className, title = "CP Tracker" }: { className?: string; title?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 32 32" role="img" aria-label={title} className={cn("size-7 shrink-0", className)}>
      <defs>
        <linearGradient id={`${id}-tile`} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#15241f" />
          <stop offset="1" stopColor="#0b0f14" />
        </linearGradient>
        <linearGradient id={`${id}-ink`} x1="6" y1="24" x2="27" y2="8" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#2dd4bf" />
          <stop offset="1" stopColor="#6ee7b7" />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="25.5" cy="10" r="6" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#6ee7b7" stopOpacity="0.55" />
          <stop offset="1" stopColor="#6ee7b7" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill={`url(#${id}-tile)`} />
      <rect x="1.5" y="1.5" width="29" height="29" rx="8" fill="none" stroke="#34d399" strokeOpacity="0.35" />
      <path d="M4 7.5 Q16 2.5 28 7.5" fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M11.2 10.2 6.6 16l4.6 5.8" fill="none" stroke={`url(#${id}-ink)`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M14.2 21.4 18.2 16.6l3 2.3 4.3-6.9" fill="none" stroke={`url(#${id}-ink)`} strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="25.5" cy="10" r="6" fill={`url(#${id}-glow)`} />
      <circle cx="25.5" cy="10" r="2.1" fill="#a7f3d0" />
    </svg>
  );
}

/** Mark + wordmark. */
export function Logo({ className, size = "md" }: { className?: string; size?: "md" | "lg" }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={size === "lg" ? "size-10" : "size-7"} />
      <span className="flex flex-col leading-none">
        <span className={cn("font-semibold tracking-tight", size === "lg" ? "text-lg" : "text-sm")}>
          CP Tracker
        </span>
        <span className={cn("mt-1 font-medium uppercase tracking-[0.18em] text-muted-foreground", size === "lg" ? "text-[10px]" : "text-[9px]")}>
          NIAT · Codeforces
        </span>
      </span>
    </span>
  );
}
