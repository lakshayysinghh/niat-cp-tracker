/**
 * Display helpers shared by server and client components. Pure.
 * Times are stored in UTC and always shown in IST (Section 3, rule 6).
 */

const TZ = "Asia/Kolkata";

const dateFmt = new Intl.DateTimeFormat("en-IN", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
const dateTimeFmt = new Intl.DateTimeFormat("en-IN", {
  timeZone: TZ,
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

const toDate = (d: Date | string) => (d instanceof Date ? d : new Date(d));

export function formatDateIST(d: Date | string | null | undefined): string {
  return d ? dateFmt.format(toDate(d)) : "—";
}

export function formatDateTimeIST(d: Date | string | null | undefined): string {
  return d ? `${dateTimeFmt.format(toDate(d))} IST` : "—";
}

export function relativeTime(d: Date | string | null | undefined, now: number = Date.now()): string {
  if (!d) return "never";
  const s = Math.round((now - toDate(d).getTime()) / 1000);
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const days = Math.round(h / 24);
  if (days < 30) return `${days} d ago`;
  return formatDateIST(d);
}

/** Seconds from contest start -> "01:12" */
export function formatClock(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "+919876543210" -> "+91 98765 43210" */
export function formatPhone(phone: string): string {
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export const PLACEHOLDER_NIAT_PREFIX = "TBD-";
export const isPlaceholderNiatId = (id: string) => id.toUpperCase().startsWith(PLACEHOLDER_NIAT_PREFIX);

export function pct(n: number, d: number): string {
  return d > 0 ? `${Math.round((n / d) * 100)}%` : "—";
}

export function fixed1(n: number | null | undefined): string {
  return n == null || Number.isNaN(n) ? "—" : n.toFixed(1);
}

// ---------------------------------------------------------------- Codeforces links

export interface ContestRef {
  kind: "GROUP" | "GYM";
  cfContestId: number;
  groupCode: string | null;
}

export function contestBaseUrl(c: ContestRef): string {
  return c.kind === "GROUP" && c.groupCode
    ? `https://codeforces.com/group/${c.groupCode}/contest/${c.cfContestId}`
    : `https://codeforces.com/gym/${c.cfContestId}`;
}

export const problemUrl = (c: ContestRef, index: string) => `${contestBaseUrl(c)}/problem/${index}`;
export const standingsUrl = (c: ContestRef) => `${contestBaseUrl(c)}/standings`;
export const profileUrl = (handle: string) => `https://codeforces.com/profile/${encodeURIComponent(handle)}`;
