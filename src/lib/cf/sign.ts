import "server-only";
import { createHash, randomInt } from "node:crypto";

/**
 * Codeforces request signing (IMPLEMENTATION_PLAN.md, Section 4 "Request signing").
 *
 * Pure: no network, no env access. `rand` and `time` are injectable so the
 * documentation test vector is reproducible.
 */

export type CfParamValue = string | number | boolean | null | undefined;
export type CfParams = Record<string, CfParamValue>;
export type CfPair = readonly [key: string, value: string];

const RAND_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";

/** Six random characters from [a-z0-9]. */
export function randomRand(): string {
  let out = "";
  for (let i = 0; i < 6; i++) out += RAND_ALPHABET[randomInt(RAND_ALPHABET.length)];
  return out;
}

/** Drop null/undefined, stringify the rest. Booleans become "true" / "false". */
export function toPairs(params: CfParams): CfPair[] {
  const pairs: CfPair[] = [];
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    pairs.push([key, String(value)]);
  }
  return pairs;
}

/** Sort by key, then by value, using plain code-unit order (not locale order). */
export function sortPairs(pairs: readonly CfPair[]): CfPair[] {
  const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
  return [...pairs].sort((x, y) => cmp(x[0], y[0]) || cmp(x[1], y[1]));
}

/**
 * Base string built from RAW, UNENCODED values:
 * `{rand}/{method}?{k1}={v1}&{k2}={v2}…#{secret}`
 * `pairs` must already include apiKey and time.
 */
export function buildSignatureBase(
  method: string,
  pairs: readonly CfPair[],
  secret: string,
  rand: string,
): string {
  const query = sortPairs(pairs)
    .map(([k, v]) => `${k}=${v}`)
    .join("&");
  return `${rand}/${method}?${query}#${secret}`;
}

export function sha512Hex(input: string): string {
  return createHash("sha512").update(input, "utf8").digest("hex");
}

export interface SignInput {
  method: string;
  params: CfParams;
  apiKey: string;
  secret: string;
  /** Unix seconds. Defaults to now. */
  time?: number;
  /** Six chars from [a-z0-9]. Defaults to random. */
  rand?: string;
}

export interface SignedRequest {
  /** Sorted pairs including apiKey and time, without apiSig. */
  pairs: CfPair[];
  apiSig: string;
  /** Full GET URL with URL-encoded params plus apiSig. */
  url: string;
}

export const CF_API_BASE = "https://codeforces.com/api";

export function signRequest(input: SignInput): SignedRequest {
  const rand = input.rand ?? randomRand();
  if (!/^[a-z0-9]{6}$/.test(rand)) throw new Error(`rand must be 6 chars of [a-z0-9], got "${rand}"`);
  const time = input.time ?? Math.floor(Date.now() / 1000);

  const pairs = sortPairs([
    ...toPairs(input.params).filter(([k]) => k !== "apiKey" && k !== "time" && k !== "apiSig"),
    ["apiKey", input.apiKey],
    ["time", String(time)],
  ]);
  const apiSig = rand + sha512Hex(buildSignatureBase(input.method, pairs, input.secret, rand));

  const qs = new URLSearchParams([...pairs, ["apiSig", apiSig]].map(([k, v]) => [k, v]));
  return { pairs, apiSig, url: `${CF_API_BASE}/${input.method}?${qs.toString()}` };
}
