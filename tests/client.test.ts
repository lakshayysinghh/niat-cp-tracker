import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  CfAuthError,
  CfContestAccessError,
  CfFailedError,
  CfHandleNotFoundError,
  CfRateLimitError,
  CfSchemaError,
  CfUnreachableError,
  createCfClient,
  mapCfError,
} from "@/lib/cf/client";

describe("mapCfError (comment-prefix mapping)", () => {
  it("maps handles: not found and extracts the handle", () => {
    const e = mapCfError("user.info", "handles: User with handle no_such_user_zz not found");
    expect(e).toBeInstanceOf(CfHandleNotFoundError);
    expect((e as CfHandleNotFoundError).handle).toBe("no_such_user_zz");
  });

  it("maps singular handle: (user.status)", () => {
    const e = mapCfError("user.status", "handle: User with handle abc not found");
    expect(e).toBeInstanceOf(CfHandleNotFoundError);
  });

  it("maps contestId: with an actionable message", () => {
    const e = mapCfError("contest.standings", "contestId: Contest with id 734032 not found", {
      keyHandle: "bhagi_1122",
      groupCode: "vP4zGe21UV",
      contestId: 734032,
    });
    expect(e).toBeInstanceOf(CfContestAccessError);
    expect(e.message).toContain("tick \"Manager\" for this contest");
    expect(e.message).toContain("`bhagi_1122` is a manager of group `vP4zGe21UV`");
    expect(e.message).toContain("contest 734032");
  });

  it("maps apiKey / apiSig / signature errors", () => {
    expect(mapCfError("x", "apiKey: Incorrect API key")).toBeInstanceOf(CfAuthError);
    expect(mapCfError("x", "apiSig: Incorrect signature")).toBeInstanceOf(CfAuthError);
  });

  it("a key/signature error wins when Codeforces reports several parameters", () => {
    const e = mapCfError("contest.standings", "contestId: Contest with id 734032 not found;apiKey: Incorrect signature", {
      keyHandle: "bhagi_1122",
      groupCode: "vP4zGe21UV",
      contestId: 734032,
    });
    expect(e).toBeInstanceOf(CfAuthError);
    expect(e.message).toContain("Codeforces rejected the API key or signature");
    expect(e.message).toContain("Check CF_API_KEY and CF_API_SECRET");
    expect(e.message).not.toContain("Manager");
  });

  it("plain contest not found still points at the Manager checkbox", () => {
    const e = mapCfError("contest.standings", "contestId: Contest with id 734032 not found", { groupCode: "vP4zGe21UV", contestId: 734032 });
    expect(e).toBeInstanceOf(CfContestAccessError);
  });

  it("the asManager refusal is not mistaken for a key problem", () => {
    const e = mapCfError("contest.standings", 'contestId: Contest with id 1 not found;asManager: Only contest managers can use "asManager" option');
    expect(e).toBeInstanceOf(CfContestAccessError);
  });

  it("falls back to CfFailedError", () => {
    expect(mapCfError("x", "something else")).toBeInstanceOf(CfFailedError);
  });
});

/** Fake clock + fetch so retry and throttle rules run instantly. */
function harness(responses: Array<{ status: number; body: string }>) {
  let t = 0;
  const sleeps: number[] = [];
  const startTimes: number[] = [];
  const urls: string[] = [];
  const fetchImpl = (async (url: string) => {
    urls.push(url);
    startTimes.push(t);
    const r = responses.shift();
    if (!r) throw new Error("no more fake responses");
    t += 100; // each request takes 100 ms
    return new Response(r.body, { status: r.status });
  }) as unknown as typeof fetch;
  const client = createCfClient({
    apiKey: "k",
    secret: "s",
    keyHandle: "bhagi_1122",
    fetchImpl,
    now: () => t,
    sleep: async (ms) => {
      sleeps.push(ms);
      t += ms;
    },
  });
  return { client, sleeps, startTimes, urls };
}

const ok = (result: unknown) => ({ status: 200, body: JSON.stringify({ status: "OK", result }) });
const failed = (comment: string, status = 400) => ({ status, body: JSON.stringify({ status: "FAILED", comment }) });

describe("cfCall client", () => {
  it("keeps at least 2,100 ms between calls", async () => {
    const h = harness([ok([]), ok([]), ok([])]);
    await Promise.all([h.client.request("a"), h.client.request("b"), h.client.request("c")]);
    expect(h.startTimes).toEqual([0, 2200, 4400]); // 100 ms call + 2,100 ms gap
    expect(h.client.callCount()).toBe(3);
  });

  it("retries rate limiting after 3 s then 6 s, then throws CfRateLimitError", async () => {
    const h = harness([{ status: 503, body: "" }, failed("Call limit exceeded"), { status: 429, body: "" }]);
    await expect(h.client.request("user.info")).rejects.toBeInstanceOf(CfRateLimitError);
    expect(h.sleeps.filter((ms) => ms === 3000 || ms === 6000)).toEqual([3000, 6000]);
    expect(h.client.callCount()).toBe(3);
  });

  it("succeeds on the second try after one rate-limit response", async () => {
    const h = harness([failed("Call limit exceeded"), ok([{ handle: "x" }])]);
    const users = await h.client.call("user.info", { handles: "x" }, z.array(z.object({ handle: z.string() })));
    expect(users).toEqual([{ handle: "x" }]);
  });

  it("maps FAILED responses to typed errors", async () => {
    const h = harness([failed("handles: User with handle zz not found")]);
    await expect(h.client.call("user.info", { handles: "zz" }, z.unknown())).rejects.toBeInstanceOf(
      CfHandleNotFoundError,
    );
  });

  it("treats HTML as unreachable without retrying", async () => {
    const h = harness([{ status: 403, body: "<!DOCTYPE html><html>Just a moment...</html>" }]);
    await expect(h.client.request("user.info")).rejects.toBeInstanceOf(CfUnreachableError);
    expect(h.client.callCount()).toBe(1);
  });

  it("wraps network errors as unreachable", async () => {
    const client = createCfClient({
      apiKey: "k",
      secret: "s",
      fetchImpl: (async () => {
        throw new TypeError("fetch failed");
      }) as unknown as typeof fetch,
      sleep: async () => {},
    });
    await expect(client.request("user.info")).rejects.toBeInstanceOf(CfUnreachableError);
  });

  it("fails loudly when the result does not match the schema", async () => {
    const h = harness([ok([{ nope: 1 }])]);
    const err = await h.client
      .call("user.info", {}, z.array(z.object({ handle: z.string() })))
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(CfSchemaError);
    expect((err as CfSchemaError).path).toBe("0.handle");
  });

  it("sends a signed GET with apiKey, time and apiSig", async () => {
    const h = harness([ok([])]);
    await h.client.request("user.info", { handles: "a;b" });
    const u = new URL(h.urls[0]);
    expect(u.origin + u.pathname).toBe("https://codeforces.com/api/user.info");
    expect(u.searchParams.get("handles")).toBe("a;b");
    expect(u.searchParams.get("apiKey")).toBe("k");
    expect(u.searchParams.get("time")).toMatch(/^\d+$/);
    expect(u.searchParams.get("apiSig")).toMatch(/^[a-z0-9]{6}[0-9a-f]{128}$/);
  });
});
