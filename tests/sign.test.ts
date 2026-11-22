import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { buildSignatureBase, randomRand, signRequest, sortPairs, toPairs } from "@/lib/cf/sign";

const sha512 = (s: string) => createHash("sha512").update(s, "utf8").digest("hex");

describe("Codeforces signer", () => {
  it("matches the documentation vector (Section 4)", () => {
    const base = buildSignatureBase(
      "contest.hacks",
      toPairs({ contestId: 566, apiKey: "xxx", time: 1793878136 }),
      "yyy",
      "123456",
    );
    expect(base).toBe("123456/contest.hacks?apiKey=xxx&contestId=566&time=1793878136#yyy");
  });

  it("signRequest produces apiSig = rand + sha512(base) for the documentation vector", () => {
    const signed = signRequest({
      method: "contest.hacks",
      params: { contestId: 566 },
      apiKey: "xxx",
      secret: "yyy",
      time: 1793878136,
      rand: "123456",
    });
    const expected = "123456" + sha512("123456/contest.hacks?apiKey=xxx&contestId=566&time=1793878136#yyy");
    expect(signed.apiSig).toBe(expected);
    expect(signed.url).toBe(
      `https://codeforces.com/api/contest.hacks?apiKey=xxx&contestId=566&time=1793878136&apiSig=${expected}`,
    );
  });

  it("signs the raw ';' separator but URL-encodes it on the wire (two handles)", () => {
    const signed = signRequest({
      method: "user.info",
      params: { handles: "usecarelessly18;gorugantisathish", checkHistoricHandles: true },
      apiKey: "k",
      secret: "s",
      time: 1700000000,
      rand: "abc123",
    });
    const base = "abc123/user.info?apiKey=k&checkHistoricHandles=true&handles=usecarelessly18;gorugantisathish&time=1700000000#s";
    expect(signed.apiSig).toBe("abc123" + sha512(base));
    expect(signed.url).toContain("handles=usecarelessly18%3Bgorugantisathish");
    expect(signed.url).not.toContain("handles=usecarelessly18;");
  });

  it("sorts by key, then by value, in code-unit order", () => {
    expect(
      sortPairs([
        ["b", "2"],
        ["a", "z"],
        ["a", "B"],
        ["a", "b"],
        ["Z", "1"],
      ]),
    ).toEqual([
      ["Z", "1"],
      ["a", "B"],
      ["a", "b"],
      ["a", "z"],
      ["b", "2"],
    ]);
  });

  it("drops undefined/null params and stringifies booleans", () => {
    expect(toPairs({ a: undefined, b: null, c: false, d: 0, e: "x" })).toEqual([
      ["c", "false"],
      ["d", "0"],
      ["e", "x"],
    ]);
  });

  it("ignores caller-supplied apiKey/time/apiSig params", () => {
    const signed = signRequest({
      method: "m",
      params: { apiKey: "evil", time: 1, apiSig: "x", q: "1" },
      apiKey: "k",
      secret: "s",
      time: 5,
      rand: "aaaaaa",
    });
    expect(signed.pairs).toEqual([
      ["apiKey", "k"],
      ["q", "1"],
      ["time", "5"],
    ]);
  });

  it("random rand is 6 chars of [a-z0-9]", () => {
    for (let i = 0; i < 200; i++) expect(randomRand()).toMatch(/^[a-z0-9]{6}$/);
  });

  it("rejects a malformed rand", () => {
    expect(() => signRequest({ method: "m", params: {}, apiKey: "k", secret: "s", rand: "ABC" })).toThrow();
  });
});
