import "server-only";
import type { z } from "zod";
import { cfEnvelope, type CfEnvelope } from "./schemas";
import { signRequest, type CfParams } from "./sign";

/**
 * cfCall(): the ONLY road to Codeforces (IMPLEMENTATION_PLAN.md, Sections 3 and 4).
 * Signs every request, keeps >= 2,100 ms between calls in this process, retries
 * rate-limit responses (3 s, then 6 s), validates with zod and maps errors by the
 * comment's parameter prefix. The cross-process database lock is added in Phase 2.
 */

// ---------------------------------------------------------------- errors

export class CfError extends Error {
  readonly code: string;
  readonly method?: string;
  readonly comment?: string;
  constructor(code: string, message: string, opts: { method?: string; comment?: string; cause?: unknown } = {}) {
    super(message, { cause: opts.cause });
    this.name = new.target.name;
    this.code = code;
    this.method = opts.method;
    this.comment = opts.comment;
  }
}

/** HTTP 429/503 or "Call limit exceeded", still failing after two retries. */
export class CfRateLimitError extends CfError {
  constructor(method: string, detail: string) {
    super("CF_RATE_LIMIT", `Codeforces call limit exceeded on ${method} after 2 retries (${detail})`, { method });
  }
}

/** `handles: User with handle X not found` (or `handle:` on single-handle methods). */
export class CfHandleNotFoundError extends CfError {
  readonly handle: string;
  constructor(method: string, comment: string, handle: string) {
    super("CF_HANDLE_NOT_FOUND", `Codeforces handle not found: ${handle}`, { method, comment });
    this.handle = handle;
  }
}

/** `contestId: …` — the key account cannot see the contest, or the ID is wrong. */
export class CfContestAccessError extends CfError {
  constructor(method: string, comment: string, message: string) {
    super("CF_CONTEST_ACCESS", message, { method, comment });
  }
}

/** `apiKey: …`, `apiSig: …`, `time: …` or a signature problem. */
export class CfAuthError extends CfError {
  constructor(method: string, comment: string) {
    super(
      "CF_AUTH",
      `Codeforces rejected the API key or signature: ${comment}. Check CF_API_KEY and CF_API_SECRET where this app runs (Render environment / GitHub Actions secrets): the same pair as on codeforces.com/settings/api, not swapped, no spaces.`,
      { method, comment },
    );
  }
}

/** HTML instead of JSON (Cloudflare challenge), network failure or timeout. */
export class CfUnreachableError extends CfError {
  constructor(method: string, detail: string, cause?: unknown) {
    super("CF_UNREACHABLE", `Codeforces unreachable (${detail})`, { method, cause });
  }
}

/** JSON that does not match the expected shape. */
export class CfSchemaError extends CfError {
  readonly path: string;
  constructor(method: string, path: string, detail: string) {
    super("CF_SCHEMA", `Codeforces response for ${method} failed validation at ${path || "<root>"}: ${detail}`, {
      method,
    });
    this.path = path;
  }
}

/** Any other FAILED response. */
export class CfFailedError extends CfError {
  constructor(method: string, comment: string) {
    super("CF_FAILED", `Codeforces ${method} failed: ${comment}`, { method, comment });
  }
}

export interface CfErrorContext {
  keyHandle?: string;
  groupCode?: string | null;
  contestId?: number | string;
}

/** Pure: map a FAILED comment to a typed error by its parameter-name prefix. */
export function mapCfError(method: string, comment: string, ctx: CfErrorContext = {}): CfError {
  const c = comment.trim();

  // A key/signature problem wins over everything else. Codeforces can report several
  // parameters at once ("contestId: … not found;apiKey: Incorrect signature"); with a bad
  // signature the request is treated as anonymous, so "not found" is only a symptom.
  if (/(^|;\s*)(apiKey|apiSig|time)\s*:/i.test(c) || /incorrect signature|incorrect api key/i.test(c)) {
    return new CfAuthError(method, comment);
  }

  const notFound = /^handles?:\s*User with handle (.+?) not found/i.exec(c);
  if (notFound) return new CfHandleNotFoundError(method, comment, notFound[1]);

  if (/^contestId\s*:/i.test(c)) {
    const who = ctx.keyHandle ? `\`${ctx.keyHandle}\`` : "the API key account";
    const contest = ctx.contestId !== undefined ? ` ${ctx.contestId}` : "";
    // Phase 0 finding: API access follows the per-contest "Manager" checkbox on the
    // group's Contests page, even for a group manager (tests/fixtures/README.md).
    const fix = ctx.groupCode
      ? `On codeforces.com/group/${ctx.groupCode}/contests, tick "Manager" for this contest, and make sure ${who} is a manager of group \`${ctx.groupCode}\`.`
      : `Make sure the contest ID is correct and ${who} is a manager of the contest.`;
    return new CfContestAccessError(method, comment, `Codeforces could not show contest${contest} to ${who}. ${fix} (${c})`);
  }

  return new CfFailedError(method, comment);
}

// ---------------------------------------------------------------- client

export interface CfClientOptions {
  apiKey: string;
  secret: string;
  keyHandle?: string;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Minimum gap between the end of one call and the start of the next. */
  minGapMs?: number;
  /** Waits before retry 1 and retry 2 on rate limiting. */
  retryDelaysMs?: readonly [number, number];
  timeoutMs?: number;
}

export interface CfRawResponse {
  method: string;
  /** Method params only (no apiKey, time or apiSig). */
  params: CfParams;
  httpStatus: number;
  envelope: CfEnvelope;
  /** Codeforces' HTTP Date header, for clock-skew diagnostics. */
  serverDate?: string | null;
}

export interface CfClient {
  /** Signed, throttled, retried call; returns OK or FAILED envelopes without throwing on FAILED. */
  request(method: string, params?: CfParams): Promise<CfRawResponse>;
  /** request() + error mapping + zod validation of `result`. */
  call<S extends z.ZodType>(method: string, params: CfParams, schema: S, ctx?: CfErrorContext): Promise<z.infer<S>>;
  /** Number of HTTP requests made so far (for sync_runs.cf_calls). */
  callCount(): number;
}

export const MIN_GAP_MS = 2100;
const RETRY_DELAYS_MS = [3000, 6000] as const;

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

type Attempt =
  | { kind: "done"; httpStatus: number; envelope: CfEnvelope; serverDate: string | null }
  | { kind: "rate-limited"; detail: string };

export function createCfClient(opts: CfClientOptions): CfClient {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleep = opts.sleep ?? defaultSleep;
  const now = opts.now ?? Date.now;
  const minGapMs = opts.minGapMs ?? MIN_GAP_MS;
  const retryDelays = opts.retryDelaysMs ?? RETRY_DELAYS_MS;
  const timeoutMs = opts.timeoutMs ?? 30_000;

  let chain: Promise<unknown> = Promise.resolve();
  let lastCallEndedAt = Number.NEGATIVE_INFINITY;
  let calls = 0;

  /** Serialise calls and keep the gap, measured from the end of the previous call. */
  function throttled<T>(fn: () => Promise<T>): Promise<T> {
    const run = chain.then(async () => {
      const wait = lastCallEndedAt + minGapMs - now();
      if (wait > 0) await sleep(wait);
      try {
        calls++;
        return await fn();
      } finally {
        lastCallEndedAt = now();
      }
    });
    chain = run.catch(() => undefined);
    return run;
  }

  async function attempt(method: string, params: CfParams): Promise<Attempt> {
    const { url } = signRequest({ method, params, apiKey: opts.apiKey, secret: opts.secret });

    let res: Response;
    let text: string;
    try {
      res = await fetchImpl(url, {
        method: "GET",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(timeoutMs),
      });
      text = await res.text();
    } catch (err) {
      throw new CfUnreachableError(method, `network error: ${(err as Error).message ?? String(err)}`, err);
    }

    if (res.status === 429 || res.status === 503) return { kind: "rate-limited", detail: `HTTP ${res.status}` };

    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      const looksHtml = /^\s*</.test(text);
      throw new CfUnreachableError(
        method,
        `HTTP ${res.status}, ${looksHtml ? "HTML instead of JSON (possible Cloudflare challenge)" : "non-JSON body"}`,
      );
    }

    const parsed = cfEnvelope.safeParse(json);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new CfSchemaError(method, issue?.path.join(".") ?? "", issue?.message ?? "invalid envelope");
    }
    if (parsed.data.status === "FAILED" && /call limit exceeded/i.test(parsed.data.comment)) {
      return { kind: "rate-limited", detail: parsed.data.comment };
    }
    return { kind: "done", httpStatus: res.status, envelope: parsed.data, serverDate: res.headers.get("date") };
  }

  async function request(method: string, params: CfParams = {}): Promise<CfRawResponse> {
    let last = "";
    for (let i = 0; i <= retryDelays.length; i++) {
      const r = await throttled(() => attempt(method, params));
      if (r.kind === "done") return { method, params, httpStatus: r.httpStatus, envelope: r.envelope, serverDate: r.serverDate };
      last = r.detail;
      if (i < retryDelays.length) await sleep(retryDelays[i]);
    }
    throw new CfRateLimitError(method, last);
  }

  async function call<S extends z.ZodType>(
    method: string,
    params: CfParams,
    schema: S,
    ctx: CfErrorContext = {},
  ): Promise<z.infer<S>> {
    const { envelope } = await request(method, params);
    if (envelope.status === "FAILED") {
      throw mapCfError(method, envelope.comment, { keyHandle: opts.keyHandle, ...ctx });
    }
    const parsed = schema.safeParse(envelope.result);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new CfSchemaError(method, issue?.path.join(".") ?? "", issue?.message ?? "invalid result");
    }
    return parsed.data;
  }

  return { request, call, callCount: () => calls };
}

// ---------------------------------------------------------------- default instance

let defaultClient: CfClient | undefined;

const QUOTED = /^(['"`])([\s\S]*)\1$/;

/**
 * Clean a pasted credential: trim spaces / line breaks, drop surrounding quotes and a
 * pasted "NAME=" prefix. Any of these silently breaks every signature.
 */
export function cleanCredential(raw: string | undefined, name: string): string | undefined {
  if (raw == null) return undefined;
  let v = raw.trim();
  if (v.toUpperCase().startsWith(`${name.toUpperCase()}=`)) v = v.slice(name.length + 1).trim();
  const q = QUOTED.exec(v);
  if (q) v = q[2].trim();
  return v;
}

/** Lazily reads CF_API_KEY, CF_API_SECRET and CF_KEY_HANDLE, so scripts can load env first. */
export function getCfClient(): CfClient {
  if (!defaultClient) {
    const apiKey = cleanCredential(process.env.CF_API_KEY, "CF_API_KEY");
    const secret = cleanCredential(process.env.CF_API_SECRET, "CF_API_SECRET");
    if (!apiKey || !secret) throw new Error("CF_API_KEY and CF_API_SECRET must be set");
    defaultClient = createCfClient({ apiKey, secret, keyHandle: cleanCredential(process.env.CF_KEY_HANDLE, "CF_KEY_HANDLE") });
  }
  return defaultClient;
}

export interface CredentialDiagnostics {
  /** first 6 characters of the key (the key is sent in every request URL anyway) */
  keyPrefix: string;
  keyLength: number;
  secretLength: number;
  /** first 8 hex of SHA-256(secret): compare environments without revealing the secret */
  secretFingerprint: string;
  /** problems found in the raw environment values, before cleaning */
  issues: string[];
}

/** Safe-to-show facts about the configured credentials. Never returns the secret itself. */
export async function credentialDiagnostics(env: Record<string, string | undefined> = process.env): Promise<CredentialDiagnostics> {
  const rawKey = env.CF_API_KEY ?? "";
  const rawSecret = env.CF_API_SECRET ?? "";
  const key = cleanCredential(rawKey, "CF_API_KEY") ?? "";
  const secret = cleanCredential(rawSecret, "CF_API_SECRET") ?? "";
  const issues: string[] = [];
  const checks: Array<[string, string, string]> = [
    ["CF_API_KEY", rawKey, key],
    ["CF_API_SECRET", rawSecret, secret],
  ];
  for (const [name, raw, clean] of checks) {
    if (!raw) issues.push(`${name} is not set`);
    if (raw !== raw.trim()) issues.push(`${name} has spaces or a line break around it (now ignored)`);
    if (QUOTED.test(raw.trim())) issues.push(`${name} is wrapped in quotes (now ignored)`);
    if (raw.trim().toUpperCase().startsWith(`${name}=`)) issues.push(`${name} value starts with "${name}=" (now ignored)`);
    if (clean && !/^[0-9a-f]{40}$/.test(clean)) issues.push(`${name} is not 40 lowercase hex characters (length ${clean.length})`);
  }
  if (key && key === secret) issues.push("CF_API_KEY and CF_API_SECRET are the same value");
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret));
  const secretFingerprint = [...new Uint8Array(digest)]
    .slice(0, 4)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return { keyPrefix: key.slice(0, 6), keyLength: key.length, secretLength: secret.length, secretFingerprint, issues };
}

export function cfCall<S extends z.ZodType>(
  method: string,
  params: CfParams,
  schema: S,
  ctx?: CfErrorContext,
): Promise<z.infer<S>> {
  return getCfClient().call(method, params, schema, ctx);
}
