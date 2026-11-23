import { formatDateIST } from "./format";

/** Fields a contest can be searched by. Pure, so it is unit-tested. */
export interface SearchableContest {
  title: string;
  cfContestId: number;
  groupCode: string | null;
  kind: "GROUP" | "GYM";
  startsAt: Date | string | null;
}

/** Name, contest id, group code, type, IST date ("19 Nov 2026") and full month name. */
export function contestHaystack(c: SearchableContest): string {
  const month = c.startsAt ? new Date(c.startsAt).toLocaleString("en-IN", { month: "long", timeZone: "Asia/Kolkata" }) : "";
  return [c.title, String(c.cfContestId), c.groupCode ?? "", c.kind === "GROUP" ? "group" : "gym", formatDateIST(c.startsAt), month].join(" ").toLowerCase();
}

/** Every whitespace-separated word must appear somewhere ("number theory nov"). Empty query matches all. */
export function matchesContestQuery(c: SearchableContest, query: string): boolean {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const h = contestHaystack(c);
  return words.every((w) => h.includes(w));
}
