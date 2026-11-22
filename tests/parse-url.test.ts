import { describe, expect, it } from "vitest";
import { canonicalContestUrl, parseCfUrl, parseGroupCode, URL_ERROR } from "@/lib/cf/parse-url";

describe("parseCfUrl", () => {
  const group = { kind: "GROUP", cfContestId: 734032, groupCode: "vP4zGe21UV" };
  it.each([
    "https://codeforces.com/group/vP4zGe21UV/contest/734032",
    "https://codeforces.com/group/vP4zGe21UV/contest/734032/",
    "https://codeforces.com/group/vP4zGe21UV/contest/734032/standings",
    "https://codeforces.com/group/vP4zGe21UV/contest/734032/standings?showUnofficial=true#top",
    "https://codeforces.com/group/vP4zGe21UV/contest/734032/problems",
    "https://codeforces.com/group/vP4zGe21UV/contest/734032/problem/A",
    "https://codeforces.com/group/vP4zGe21UV/contest/734032/status",
    "http://www.codeforces.com/group/vP4zGe21UV/contest/734032",
    "https://mirror.codeforces.com/group/vP4zGe21UV/contest/734032",
    "https://m1.codeforces.com/group/vP4zGe21UV/contest/734032",
    "https://codeforces.net/group/vP4zGe21UV/contest/734032",
    "codeforces.com/group/vP4zGe21UV/contest/734032",
    "  https://CODEFORCES.COM/group/vP4zGe21UV/contest/734032  ",
  ])("group contest: %s", (url) => expect(parseCfUrl(url)).toEqual({ ok: true, value: group }));

  it.each(["https://codeforces.com/gym/102951", "https://codeforces.com/gym/102951/standings", "https://codeforces.com/gym/102951/problem/A"])(
    "gym: %s",
    (url) => expect(parseCfUrl(url)).toEqual({ ok: true, value: { kind: "GYM", cfContestId: 102951, groupCode: null } }),
  );

  it("group link alone", () => {
    expect(parseCfUrl("https://codeforces.com/group/vP4zGe21UV/")).toEqual({ ok: true, value: { kind: "GROUP_LINK", groupCode: "vP4zGe21UV" } });
  });

  it.each([
    "",
    "not a url",
    "https://example.com/group/vP4zGe21UV/contest/734032",
    "https://codeforces.com.evil.com/gym/1",
    "https://codeforces.com/contest/2000",
    "https://codeforces.com/group/vP4zGe21UV/contest/abc",
    "https://codeforces.com/group/vP4zGe21UV/members",
    "https://codeforces.com/profile/tourist",
  ])("rejects %j", (url) => expect(parseCfUrl(url)).toEqual({ ok: false, error: URL_ERROR }));

  it("canonical URL", () => {
    expect(canonicalContestUrl({ kind: "GROUP", cfContestId: 734032, groupCode: "vP4zGe21UV" })).toBe(
      "https://codeforces.com/group/vP4zGe21UV/contest/734032",
    );
    expect(canonicalContestUrl({ kind: "GYM", cfContestId: 1, groupCode: null })).toBe("https://codeforces.com/gym/1");
  });
});

describe("parseGroupCode (linked groups)", () => {
  it.each([
    ["vP4zGe21UV", "vP4zGe21UV"],
    ["  vP4zGe21UV  ", "vP4zGe21UV"],
    ["https://codeforces.com/group/vP4zGe21UV", "vP4zGe21UV"],
    ["https://codeforces.com/group/vP4zGe21UV/contests", "vP4zGe21UV"],
    ["https://codeforces.com/group/vP4zGe21UV/members?x=1", "vP4zGe21UV"],
    ["https://codeforces.com/group/vP4zGe21UV/contest/734032/standings", "vP4zGe21UV"],
    ["mirror.codeforces.com/group/vP4zGe21UV/contests", "vP4zGe21UV"],
  ])("%s -> %s", (input, code) => expect(parseGroupCode(input)).toBe(code));

  it.each(["", "not a group!", "https://example.com/group/vP4zGe21UV", "https://codeforces.com/gym/102951", "https://codeforces.com/groupx/abc"])("rejects %j", (input) =>
    expect(parseGroupCode(input)).toBeNull(),
  );
});
