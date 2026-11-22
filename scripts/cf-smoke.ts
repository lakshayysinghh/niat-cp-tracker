/**
 * Phase 0 smoke test (IMPLEMENTATION_PLAN.md, Phase 0 / Gate 0).
 * Proves the API key, the signer and group access with real calls, and saves each
 * response to tests/fixtures/ for the Phase 2 merge tests.
 *
 *   npm run smoke
 */
import { config } from "dotenv";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { getCfClient, mapCfError, type CfRawResponse } from "../src/lib/cf/client";
import { cfContestListResult, cfStandingsResult, cfUserInfoResult } from "../src/lib/cf/schemas";

config({ path: ".env.local", quiet: true });

const HANDLES = ["usecarelessly18", "gorugantisathish"] as const;
const FAKE_HANDLE = "zz_no_such_handle_niat_0";
const CONTEST_ID = 734032;
const GROUP_CODE = "vP4zGe21UV";
const FIXTURES = path.join(process.cwd(), "tests", "fixtures");

type Verdict = { item: string; pass: boolean; evidence: string };
const verdicts: Verdict[] = [];
const record = (item: string, pass: boolean, evidence: string) => {
  verdicts.push({ item, pass, evidence });
  console.log(`  ${pass ? "PASS" : "FAIL"}  ${item}\n        ${evidence}`);
};

function save(name: string, r: CfRawResponse) {
  mkdirSync(FIXTURES, { recursive: true });
  const file = path.join(FIXTURES, name);
  // Only method params are stored; apiKey, time and apiSig never reach the fixture.
  const fixture = { method: r.method, params: r.params, fetchedAt: new Date().toISOString(), httpStatus: r.httpStatus, response: r.envelope };
  writeFileSync(file, JSON.stringify(fixture, null, 2) + "\n");
  console.log(`  saved tests/fixtures/${name}`);
}

const summarize = (r: CfRawResponse) =>
  r.envelope.status === "OK" ? `OK (HTTP ${r.httpStatus})` : `FAILED (HTTP ${r.httpStatus}): ${r.envelope.comment}`;

async function main() {
  const cf = getCfClient();
  const t0 = Date.now();
  console.log(`Key account: ${process.env.CF_KEY_HANDLE ?? "(CF_KEY_HANDLE not set)"}\n`);

  // 1. user.info with two real handles: key, signature, result order
  console.log(`[1] user.info handles=${HANDLES.join(";")}`);
  const r1 = await cf.request("user.info", { handles: HANDLES.join(";"), checkHistoricHandles: true });
  save("user-info-ok.json", r1);
  console.log(`  ${summarize(r1)}`);
  if (r1.envelope.status === "OK") {
    const users = cfUserInfoResult.parse(r1.envelope.result);
    const got = users.map((u) => u.handle);
    const inOrder = got.length === HANDLES.length && got.every((h, i) => h.toLowerCase() === HANDLES[i].toLowerCase());
    record("Call 1 returns OK, results in request order", inOrder, `requested [${HANDLES.join(", ")}] -> returned [${got.join(", ")}]`);
  } else {
    record("Call 1 returns OK, results in request order", false, summarize(r1));
  }

  // 2. user.info with one real and one fake handle: exact "not found" comment
  console.log(`\n[2] user.info handles=${HANDLES[0]};${FAKE_HANDLE}`);
  const r2 = await cf.request("user.info", { handles: `${HANDLES[0]};${FAKE_HANDLE}`, checkHistoricHandles: true });
  save("user-info-not-found.json", r2);
  console.log(`  ${summarize(r2)}`);
  if (r2.envelope.status === "FAILED") {
    const mapped = mapCfError("user.info", r2.envelope.comment);
    const pass = r2.envelope.comment.startsWith("handles:");
    record(
      "Call 2 returns FAILED with a comment starting `handles:`",
      pass,
      `comment: "${r2.envelope.comment}" -> ${mapped.name}${"handle" in mapped ? ` (handle=${String(mapped.handle)})` : ""}`,
    );
  } else {
    record("Call 2 returns FAILED with a comment starting `handles:`", false, "returned OK unexpectedly");
  }

  // 3. contest.standings for 734032, manager mode then member mode, two handles
  const modes: Array<{ mode: "MANAGER" | "MEMBER"; asManager?: boolean; file: string }> = [
    { mode: "MANAGER", asManager: true, file: `standings-${CONTEST_ID}-manager.json` },
    { mode: "MEMBER", file: `standings-${CONTEST_ID}-member.json` },
  ];
  const working: string[] = [];
  for (const m of modes) {
    console.log(`\n[3] contest.standings contestId=${CONTEST_ID} mode=${m.mode} handles=${HANDLES.join(";")} showUnofficial=true`);
    const r3 = await cf.request("contest.standings", {
      contestId: CONTEST_ID,
      handles: HANDLES.join(";"),
      showUnofficial: true,
      asManager: m.asManager,
    });
    save(m.file, r3);
    console.log(`  ${summarize(r3)}`);
    if (r3.envelope.status === "OK") {
      const parsed = cfStandingsResult.safeParse(r3.envelope.result);
      if (!parsed.success) {
        console.log(`  zod validation FAILED: ${parsed.error.issues[0]?.path.join(".")}: ${parsed.error.issues[0]?.message}`);
        continue;
      }
      const s = parsed.data;
      working.push(m.mode);
      console.log(`  contest: "${s.contest.name}" type=${s.contest.type} phase=${s.contest.phase} duration=${s.contest.durationSeconds}s`);
      console.log(`  problems: ${s.problems.map((p) => `${p.index}${p.points !== undefined ? `(${p.points})` : ""}`).join(" ")}`);
      for (const row of s.rows) {
        const cells = row.problemResults
          .map((pr, i) => `${s.problems[i]?.index}:${pr.points}/${pr.rejectedAttemptCount}${pr.bestSubmissionTimeSeconds !== undefined ? `@${pr.bestSubmissionTimeSeconds}` : ""}`)
          .join(" ");
        console.log(`    ${row.party.members.map((x) => x.handle).join(",")} ${row.party.participantType} rank=${row.rank} pts=${row.points} pen=${row.penalty} | ${cells}`);
      }
    } else {
      console.log(`  mapped: ${mapCfError("contest.standings", r3.envelope.comment, { keyHandle: process.env.CF_KEY_HANDLE, groupCode: GROUP_CODE, contestId: CONTEST_ID }).message}`);
    }
  }
  record(
    "Call 3 returns OK in at least one mode (working mode written down)",
    working.length > 0,
    working.length ? `working mode(s): ${working.join(", ")}` : "neither MANAGER nor MEMBER returned OK",
  );

  // 4. contest.list gym=true groupCode: group discovery
  console.log(`\n[4] contest.list gym=true groupCode=${GROUP_CODE}`);
  const r4 = await cf.request("contest.list", { gym: true, groupCode: GROUP_CODE });
  save("contest-list-group.json", r4);
  console.log(`  ${summarize(r4)}`);
  if (r4.envelope.status === "OK") {
    const list = cfContestListResult.safeParse(r4.envelope.result);
    if (list.success) {
      const has = list.data.some((c) => c.id === CONTEST_ID);
      console.log(`  ${list.data.length} contests; includes ${CONTEST_ID}: ${has}`);
      for (const c of list.data.slice(0, 10)) console.log(`    ${c.id} ${c.phase} ${c.type} "${c.name}"`);
      record("Call 4 (group discovery) returns OK", true, `${list.data.length} contests, includes ${CONTEST_ID}: ${has}`);
    } else {
      record("Call 4 (group discovery) returns OK", false, `zod: ${list.error.issues[0]?.path.join(".")}: ${list.error.issues[0]?.message}`);
    }
  } else {
    record("Call 4 (group discovery) returns OK", false, summarize(r4));
  }

  console.log(`\n${cf.callCount()} Codeforces requests in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  console.log("\nSummary:");
  for (const v of verdicts) console.log(`  ${v.pass ? "PASS" : "FAIL"}  ${v.item}`);
  if (verdicts.some((v) => !v.pass)) process.exitCode = 1;
}

main().catch((err) => {
  console.error("Smoke test aborted:", err);
  process.exitCode = 1;
});
