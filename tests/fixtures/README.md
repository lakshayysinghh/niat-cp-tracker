# Codeforces fixtures (Phase 0)

Saved by `npm run smoke` (`scripts/cf-smoke.ts`) on 2026-11-22 with the API key of `bhagi_1122`.
Each file is `{ method, params, fetchedAt, httpStatus, response }`; `apiKey`, `time` and `apiSig` are never stored.

| File | Call | Result |
| --- | --- | --- |
| `user-info-ok.json` | `user.info` usecarelessly18;gorugantisathish | OK, results in request order |
| `user-info-not-found.json` | `user.info` with one fake handle | FAILED, `handles: User with handle zz_no_such_handle_niat_0 not found` (HTTP 400) |
| `standings-734032-manager.json` | `contest.standings` 734032, `asManager=true` | OK |
| `standings-734032-member.json` | `contest.standings` 734032, no `asManager` | OK |
| `contest-list-group.json` | `contest.list` gym=true, groupCode=vP4zGe21UV | OK, 14 contests |

## Findings (Gate 0)

- **Working access mode: MANAGER** (MEMBER also works for this key). `AUTO` resolves to `MANAGER`.
- **API access follows the per-contest "Manager" checkbox** on the group's Contests page
  (`codeforces.com/group/vP4zGe21UV/contests`), even for the group manager. With it unticked,
  every contest method returns `contestId: Contest with id N not found`, although the
  standings page opens in the browser. On 2026-11-22 it is ticked for 734032, 732375, 731904,
  731302 and 730357 and unticked for older contests (e.g. 728535 returns "not found").
  Tick it for every contest the dashboard should track.
- The mashups are prepared by different accounts (`noobiesAG`, `ironman263`), so a key from
  any one creator account would not manage all of them; the group-manager key + checkbox does.
- The `*` rows on the standings page arrive as `participantType: "PRACTICE"`, with
  `rank: 0`, `penalty: 35791394` and solved `bestSubmissionTimeSeconds: 2147483647` (INT_MAX).
  Never use practice-row times or penalty.
- A practice row can carry wrong attempts on a problem with no live attempt
  (usecarelessly18, D: `0/1` in PRACTICE), which is where the expected table's `−1` on D comes from.
- `contest.status` and `contest.hacks` with `asManager=true` also return OK for 734032;
  `contest.ratingChanges` returns `contestId: Rating changes are unavailable for this contest`.
