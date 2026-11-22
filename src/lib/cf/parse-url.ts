import "server-only";

/**
 * Contest and group URL parser (IMPLEMENTATION_PLAN.md, Section 9). Pure.
 * Accepts codeforces.com, www.codeforces.com, mirror.codeforces.com, m1.codeforces.com
 * and codeforces.net. Ignores trailing slashes, query strings, fragments and suffixes
 * such as /standings, /problems, /problem/A and /status.
 */

export type ParsedCfUrl =
  | { kind: "GROUP"; cfContestId: number; groupCode: string }
  | { kind: "GYM"; cfContestId: number; groupCode: null }
  | { kind: "GROUP_LINK"; groupCode: string };

export type ParseUrlResult = { ok: true; value: ParsedCfUrl } | { ok: false; error: string };

export const URL_ERROR =
  "Paste a Codeforces group contest or gym link, for example https://codeforces.com/group/vP4zGe21UV/contest/734032";

const HOSTS = new Set([
  "codeforces.com",
  "www.codeforces.com",
  "mirror.codeforces.com",
  "m1.codeforces.com",
  "codeforces.net",
]);

const GROUP_CODE = /^[A-Za-z0-9]{1,32}$/;
const CONTEST_ID = /^[1-9]\d{0,8}$/;

export function parseCfUrl(input: string | null | undefined): ParseUrlResult {
  const raw = String(input ?? "").trim();
  if (!raw) return { ok: false, error: URL_ERROR };

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return { ok: false, error: URL_ERROR };
  }
  if (!HOSTS.has(url.hostname.toLowerCase())) return { ok: false, error: URL_ERROR };

  const seg = url.pathname.split("/").filter(Boolean);

  if (seg[0]?.toLowerCase() === "group" && seg[1] && GROUP_CODE.test(seg[1])) {
    const groupCode = seg[1];
    if (seg.length === 2) return { ok: true, value: { kind: "GROUP_LINK", groupCode } };
    if (seg[2]?.toLowerCase() === "contest" && seg[3] && CONTEST_ID.test(seg[3])) {
      return { ok: true, value: { kind: "GROUP", cfContestId: Number(seg[3]), groupCode } };
    }
    return { ok: false, error: URL_ERROR };
  }

  if (seg[0]?.toLowerCase() === "gym" && seg[1] && CONTEST_ID.test(seg[1])) {
    return { ok: true, value: { kind: "GYM", cfContestId: Number(seg[1]), groupCode: null } };
  }

  return { ok: false, error: URL_ERROR };
}

/** Bare group code, or any Codeforces link inside a group (/contests, /members, a contest…). Used by linked groups. */
export function parseGroupCode(input: string | null | undefined): string | null {
  const v = String(input ?? "").trim();
  if (GROUP_CODE.test(v)) return v;
  const p = parseCfUrl(v);
  if (p.ok && (p.value.kind === "GROUP_LINK" || p.value.kind === "GROUP")) return p.value.groupCode;
  const m = /^(?:https?:\/\/)?(?:www\.|mirror\.|m1\.)?codeforces\.(?:com|net)\/group\/([A-Za-z0-9]{1,32})(?:[/?#]|$)/i.exec(v);
  return m ? m[1] : null;
}

/** Canonical URL stored in contests.source_url. */
export function canonicalContestUrl(v: { kind: "GROUP" | "GYM"; cfContestId: number; groupCode: string | null }): string {
  return v.kind === "GROUP"
    ? `https://codeforces.com/group/${v.groupCode}/contest/${v.cfContestId}`
    : `https://codeforces.com/gym/${v.cfContestId}`;
}
