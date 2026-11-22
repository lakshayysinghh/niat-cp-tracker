# NIAT Codeforces Batch Tracker — Implementation Plan v2

Nov 21, 2026 · @DSA CD Team

## Summary

This dashboard lets 2–5 admins track one batch of students across Codeforces group/gym contests. It shows who attended live, who solved what, who upsolved later, and who has gone quiet in practice. The v1 plan you shared is a solid base, and v2 keeps its stack, auth model, schema shape and verification gates. It fixes seven correctness problems that would show up with real data and adds the practice tracking that was the original goal. Two limits are fixed: at most 500 students in total, and free tiers only. Nothing here is built for growth beyond that.

Save this doc as `IMPLEMENTATION_PLAN.md` in the repo root (export as Markdown) and drive Claude Code one phase at a time with the prompts at the end.

| # | Area | v1 plan | v2 plan | Why it matters |
| --- | --- | --- | --- | --- |
| 1 | Handle verification | One batched `user.info` call | Remove any handles Codeforces says are not found, retry until the call passes, and sync only verified handles | One unknown handle makes the whole Codeforces call fail, so nobody syncs |
| 2 | Handle renames | Not handled | Store the current handle that `user.info` returns and match standings on it | A student who renames their handle silently shows as absent |
| 3 | Live vs virtual | Virtual solves count as live | Store one participation per student per contest (Live, Virtual, Practice only, Absent) with rank and penalty | Attendance at your scheduled contest is the key signal |
| 4 | Scoring | Any points above 0 count as solved | On IOI-scored contests, solved means full points | Partial scores would count as solved |
| 5 | Rate limiting | A queue inside one server process | A lock row in the database plus the in-process queue | Manual refresh runs in the web app and the scheduled sync runs in GitHub Actions, so the two can collide and hit "Call limit exceeded" |
| 6 | Status storage | Upsert every student × problem cell | Each sync replaces the contest's non-empty cells in one transaction; a missing cell means not attempted | Far fewer rows, no stale cells, and it works with the HTTP driver's lack of interactive transactions |
| 7 | Group access | Manager mode off by default | Auto: try manager mode, fall back to member mode, and remember which worked | You manage your own group; manager mode returns more data |
| 8 | Cron | Sync every contest every 2 hours | A script in GitHub Actions every 3 hours: contests from the last 21 days on every run, all contests once a night | Free hosts cap function time or sleep when idle. A GitHub runner has neither limit, and this schedule fits the 2,000 free minutes a month |
| 9 | Batches | Free-text `batchName` column | `batches` table with a foreign key, one seeded row, no switcher UI | Adding a second batch later needs no data migration |
| 10 | Practice tracking | Not covered | Phase 5: rating trend, weekly solves, inactive days, difficulty and tag spread | This was the dashboard's original purpose |
| 11 | Contest discovery | Paste every URL | Optional: link the group once and new mashups appear on their own | Less manual work every week |
| 12 | Testing | Manual gates only | Phase 0 API smoke test, saved JSON fixtures, unit tests for parser, signer, CSV and merge | The merge logic is where bugs hide |
| 13 | Phone numbers | Digits only | Normalize to `+91XXXXXXXXXX` | Mixed formats break search and duplicate checks |
| 14 | Login safety | No throttling | Login throttling, 7-day session expiry, a `role` column | An internal tool is still on the public internet |

## Open questions

Every question is now answered except #7, which needs no answer because the merge handles both scoring styles. Two limits are already settled: at most 500 students in total, and free tiers only. Phase 0 can start now.

| # | Question | Answer | What the answer changes |
| --- | --- | --- | --- |
| 1 | Is group `vP4zGe21UV` your own group (you are manager), or an external group your account only joined? | **Answered:** treat it as your own group. The team's group-creation account created it | Your account must have joined the group, ideally as a manager. Access mode stays Auto, so member mode covers the other case |
| 2 | Which Codeforces account owns the API key? | **Answered:** your own account | The group-creation account makes the mashups, so Codeforces may refuse manager mode for your key. Phase 0 shows which mode works; member mode still gives the full matrix |
| 3 | Which free host? [Vercel Hobby is for personal, non-commercial use only](https://vercel.com/docs/limits/fair-use-guidelines), and an internal NxtWave tool likely counts as commercial | **Answered:** [Render's free web service](https://render.com/docs/free), running `next start`. It sleeps after 15 idle minutes and takes up to a minute to wake | Deploy steps only. The app and the GitHub Actions sync work the same on either host |
| 4 | Who logs in: only 2–5 admins, or also instructors with view-only access? | **Answered:** only 2–5 admins. The `role` column stays, ready for `instructor` later | An extra role check on write routes |
| 5 | Should practice tracking (Phase 5) ship with V1 or after it? | **Answered:** after V1 is in daily use | Phase order and the first demo date |
| 6 | Do you set an "upsolve by" date for each contest? | **Answered:** no deadline; an upsolve counts whenever it happens. The deadline field is dropped | Whether the matrix flags late upsolves |
| 7 | Are your mashups ICPC-style (solved or not) or IOI-style (partial scores)? | ICPC assumed; IOI is handled anyway, so no answer is needed | Only the solved rule in the merge logic |

## Architecture and engineering rules

The system has two parts: a Next.js 16 web app on a free host (Render by default) that reads and writes Neon Postgres, and a scheduled sync script that GitHub Actions runs every 3 hours. Only server code talks to the Codeforces API, and only inside sync jobs, never while a page loads. The schedule lives in GitHub Actions because free hosts either sleep when idle or, like [Vercel Hobby, allow cron only once a day](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing).

&#91;embedded content: system architecture · 7 parts\]

Pages read Neon only. Manual refreshes and new contests go through API routes, and the scheduled sync script runs inside GitHub Actions. Both use the same sync engine code, the only code that calls Codeforces.

### Tech stack

- **Framework:** Next.js 16 (App Router, TypeScript strict, Node 20.9+). Next.js 16 [renamed `middleware.ts` to `proxy.ts`](https://nextjs.org/docs/app/getting-started/proxy), and it runs on the Node.js runtime.
- **UI:** Tailwind CSS, `shadcn/ui`, `lucide-react`, `@tanstack/react-table`. Phase 5 adds shadcn charts (Recharts).
- **Database:** Neon Postgres + Drizzle (`drizzle-orm/neon-http` + `@neondatabase/serverless`). The HTTP driver has no `db.transaction()`. Multi-statement writes use [`db.batch([...])`](https://orm.drizzle.team/docs/batch-api), which runs as one atomic transaction.
- **Auth:** email + password with `bcryptjs` (cost 12), and a `jose` HS256 JWT in an `HttpOnly`, `Secure`, `SameSite=Lax` cookie that expires after 7 days. No OAuth and no signup route.
- **Validation and CSV:** `zod` (also used to validate Codeforces responses), `papaparse`.
- **Tests (new):** `vitest` for the pure functions, run against saved Codeforces JSON fixtures.

### Free-tier budget

Every service stays inside its free tier at the 500-student cap. The usage figures are estimates for a full year of contests, and the sync log makes them easy to check.

| Service | Free tier used | Limit that matters | Estimated use at 500 students |
| --- | --- | --- | --- |
| [Neon](https://neon.com/faqs/free-plan-limits-and-quotas) | Free plan, one project | 1 GB storage; 100 CU-hours a month; compute sleeps after 5 idle minutes | Under 300 MB; about 35 CU-hours a month at 0.25 CU |
| [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions) | GitHub Free, private repo | 2,000 minutes a month, each job rounded up to whole minutes | About 1,500 minutes a month (about 550 at 50 students) |
| [Render](https://render.com/docs/free) | Free web service | 750 instance hours a month; sleeps after 15 idle minutes | A few hours of admin use a day |

Set the Neon compute to 0.25 CU with scale-to-zero on. If Neon hits a free limit it blocks writes or pauses compute until the next month; it never bills you.

### Engineering rules

1. **Auth boundary:** `src/proxy.ts` only redirects signed-out users to `/login`. Real checks happen in `verifySession()` at the top of every protected Server Component, Server Action and Route Handler. API routes return `401`. Admin management and deletes also call `requireRole("admin")` and return `403` otherwise.
2. **Codeforces code is server-only:** every file under `src/lib/cf/` and `src/lib/sync/` starts with `import "server-only"`. `CF_API_KEY` and `CF_API_SECRET` never appear in a `"use client"` file.
3. **One road to Codeforces:** every outbound call goes through `cfCall()`, which applies the rate limiter, the sync lock, retries, response validation and error mapping. No other code calls `fetch` on codeforces.com.
4. **Rate limit:** at least 2,100 ms between calls in one process, and only one process syncing at a time (the lock in Section 6).
5. **Pages read Neon only:** Codeforces is called only by sync jobs, manual refresh and handle verification. Calls use `cache: "no-store"`.
6. **Time:** store everything as UTC `timestamptz` and show it in IST (`Asia/Kolkata`) with `Intl.DateTimeFormat`.
7. **Batch-ready:** every student and contest has a `batch_id`. There is no batch switcher UI yet.
8. **Pure core:** the URL parser, request signer, CSV cleaner and standings merge are pure functions with no database or network access, so they can be unit-tested.
9. **UI:** dark, minimal and dense, with sticky first columns. Colour is never the only signal; every status badge also carries a symbol or text.

### Environment variables (`.env.local`, never committed)

| Variable | Purpose | Needed from |
| --- | --- | --- |
| `DATABASE_URL` | Neon pooled connection string for app queries | Phase 1 |
| `DATABASE_URL_UNPOOLED` | Neon direct connection string for `drizzle-kit` | Phase 1 |
| `SESSION_SECRET` | 32+ random bytes in hex (`openssl rand -hex 32`) | Phase 1 |
| `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | First admin login | Phase 1 |
| `CF_API_KEY`, `CF_API_SECRET` | Codeforces key from the account in open question #2. Also set CF\_KEY\_HANDLE to that account's handle, which error messages show | Phase 0 |
| GitHub Actions secrets | `DATABASE_URL`, `CF_API_KEY`, `CF_API_SECRET` and `CF_KEY_HANDLE`, copied into the repo's Actions secrets for the scheduled sync | Phase 4 |

### Folder structure

```text
├── drizzle.config.ts
├── vitest.config.ts
├── scripts/
│   ├── cf-smoke.ts              # Phase 0: proves key, signature and access; saves fixtures
│   ├── seed-admin.ts
│   ├── sync.ts                  # Phase 4: scheduled contest sync, run by GitHub Actions
│   └── practice.ts              # Phase 5: daily practice sync, run by GitHub Actions
├── tests/
│   ├── fixtures/                # real Codeforces JSON saved by cf-smoke.ts
│   └── *.test.ts
├── src/
│   ├── proxy.ts
│   ├── db/{index.ts, schema.ts}
│   ├── lib/
│   │   ├── auth.ts              # createSession, clearSession, verifySession, requireRole
│   │   ├── csv.ts               # header aliases, cleaning, row validation (pure)
│   │   ├── phone.ts             # normalize to +91XXXXXXXXXX (pure)
│   │   ├── queries/             # server-only read functions used by pages
│   │   ├── cf/
│   │   │   ├── client.ts        # cfCall: signer, limiter, retries, error mapping
│   │   │   ├── sign.ts          # SHA-512 apiSig (pure)
│   │   │   ├── parse-url.ts     # contest and group URL parser (pure)
│   │   │   └── schemas.ts       # zod schemas for Codeforces responses
│   │   └── sync/
│   │       ├── lock.ts          # database lease lock
│   │       ├── merge.ts         # standings rows to cells and participation (pure)
│   │       ├── contest.ts       # syncContest(contestId)
│   │       ├── handles.ts       # verifyHandles()
│   │       └── practice.ts      # Phase 5
│   ├── app/
│   │   ├── login/page.tsx
│   │   ├── (dashboard)/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx                 # Contests home + Add Contest bar
│   │   │   ├── contests/[id]/page.tsx   # student × problem matrix
│   │   │   ├── students/page.tsx        # roster + CSV import
│   │   │   ├── students/[niatId]/page.tsx
│   │   │   ├── overview/page.tsx        # batch attendance and at-risk list (Phase 3)
│   │   │   ├── practice/page.tsx        # Phase 5
│   │   │   └── settings/page.tsx        # admins, password, sync log (Phase 4)
│   │   └── api/…                        # see Section 9
│   └── components/
│       ├── nav-shell.tsx
│       ├── add-contest-bar.tsx
│       ├── contest-matrix-table.tsx
│       ├── student-import-dialog.tsx
│       └── status-badge.tsx
└── .github/workflows/
    ├── sync.yml                         # Phase 4: every 3 hours
    └── practice.yml                     # Phase 5: daily
```

## Codeforces API contracts

The Codeforces API covers everything this dashboard needs, with two constraints. Gym and mashup standings need a signed request from an account that can view the contest, and [the API allows at most one call every two seconds](https://codeforces.com/apiHelp). The details below follow the [official method reference](https://mirror.codeforces.com/apiHelp/methods).

### Methods used

| Method | Used for | Key parameters | Notes |
| --- | --- | --- | --- |
| `contest.standings` | Contest matrix, rank, participation | `contestId`, `handles` (`;`-separated, chunks of 100), `showUnofficial=true`, `asManager` | For gym and mashup contests it needs a signed request from an account that can view the contest. Since April 2026 it [no longer serves regular rounds to non-admins](https://codeforces.com/blog/entry/153241) |
| `user.info` | Verify handles; get the current handle after a rename; rating, rank, last online | `handles` (up to 10,000), `checkHistoricHandles=true` | One unknown handle fails the whole call |
| `contest.list` | Phase 4: find new mashups in your group | `gym=true`, `groupCode` | `groupCode` needs at least read access to the group |
| `contest.status` | Phase 5 (optional): submission times; code with `includeSources` | `contestId`, `asManager`, `includeSources`, `from`, `count` | `includeSources` works only in manager mode |
| `user.status` | Phase 5: practice submissions | `handle`, `from`, `count` | One handle per call |
| `user.rating` | Phase 5: rating history in official rounds | `handle` | One handle per call |

### Request signing

`cfCall()` signs every request, public or not, so there is only one code path.

1. Take the method parameters, add `apiKey` and `time` (Unix seconds).
2. Pick `rand`, six random characters from `[a-z0-9]`.
3. Sort the pairs by key, then by value.
4. Build the base string from **raw, unencoded** values: `{rand}/{method}?{k1}={v1}&{k2}={v2}…#{CF_API_SECRET}`.
5. `apiSig = rand + sha512Hex(base)`.
6. Send a `GET` to `https://codeforces.com/api/{method}` with URL-encoded parameters plus `apiSig`.

This drops v1's POST option because the documentation only describes GET. Chunks of 100 handles keep the URL near 2 KB. Unit test vector from the docs: rand `123456`, method `contest.hacks`, `apiKey=xxx`, `contestId=566`, `time=1793878136`, secret `yyy` must give the base string `123456/contest.hacks?apiKey=xxx&contestId=566&time=1793878136#yyy`. Phase 0 must also pass a two-handle call, which proves the raw-value rule for the `;` separator.

### Access mode per contest

Each contest stores `accessMode`: `AUTO` (default), `MANAGER` or `MEMBER`.

- `AUTO` tries `asManager=true` on the first sync. If Codeforces returns `FAILED`, it retries once without `asManager`. When that passes, it saves `resolvedMode = MEMBER`; otherwise it saves `MANAGER`.
- `MEMBER` never sends `asManager`. Use it for external groups your key account only joined.
- Manager mode returns [the information available to contest managers](https://mirror.codeforces.com/apiHelp/methods) instead of only what participants see.

### Errors and retries

Codeforces puts the failing parameter's name at the start of `comment`, such as `contestId: …` or `handles: …`. `cfCall()` maps errors by that prefix into typed errors.

| Codeforces response | Meaning | What the app does |
| --- | --- | --- |
| HTTP 429 or 503, or `Call limit exceeded` | Calls too fast | Wait 3 s and retry; after a second failure, wait 6 s and retry; then throw `CfRateLimitError` |
| `handles: User with handle … not found` | Unknown handle | `verifyHandles()` marks that handle invalid, removes it and retries the rest |
| `contestId: …` | Key account cannot see the contest, or the ID is wrong | Save `lastSyncError`: "Make sure `<key account>` has joined group `<groupCode>`" |
| `apiKey: …` or a signature error | Wrong key, secret or signer | Fail the sync and show a banner on `/settings` |
| HTML instead of JSON, or a network error | Cloudflare challenge or outage | Record "Codeforces unreachable". No retry storm; the next scheduled run tries again |
| JSON that fails the zod schema | API shape changed | Record the failing path and write nothing |

### What the API cannot tell you

- Whether a student has joined your group. A student absent from every contest is flagged "never seen" so an admin can check.
- Time spent, editorial use, or practice on other sites.

## Data model

The schema grows from 5 tables to 13: four new tables for batches, participation, sync history and linked groups, a lock table, and three Phase 5 practice tables that are created in Phase 1 so no migration is needed later. Use `drizzle-kit generate` + `drizzle-kit migrate` (versioned SQL files in `./drizzle`) instead of `push`, because real student data will live here.

**Changes from v1**

- `batches` table plus `batch_id` foreign keys replace the free-text `batchName`. The seed script creates `Batch 1`.
- `students.handleStatus` (`UNVERIFIED` / `VALID` / `INVALID`) replaces the `cfVerified` boolean, so a known-bad handle differs from an unchecked one.
- `students.enteredHandle` keeps what the admin typed; `cfHandle` and `handleLower` hold the current handle returned by `user.info`, so renames still match.
- `contests` gains `kind`, `scoringType`, `phase`, `startsAt`, `durationSeconds`, `accessMode`, `resolvedMode` and `createdBy`. Uniqueness is per batch: `(batchId, cfContestId)`.
- New `participations`: one row per student who took part in a contest (Live, Virtual or Practice only), with rank, points, penalty and solve counts. Absent = no row.
- `problem_cells` replaces `student_problem_status` and stores only non-empty cells. A missing cell means not attempted. `SOLVED_VIRTUAL` is its own status.
- `sync_runs` logs every sync for the settings page; `sync_locks` stops two processes calling Codeforces at once. The linked-groups table lists groups whose new contests are added automatically (Phase 4).
- `admins` gains `role`, `failedLogins`, `lockedUntil` and `lastLoginAt`.
- `updatedAt` now refreshes on every update via `$onUpdate`.

### `src/db/schema.ts`

```ts
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  date,
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const tsz = (name: string) => timestamp(name, { withTimezone: true });
const createdAt = () => tsz("created_at").defaultNow().notNull();

// Enums
export const adminRole = pgEnum("admin_role", ["admin", "instructor"]);
export const handleStatus = pgEnum("handle_status", ["UNVERIFIED", "VALID", "INVALID"]);
export const contestKind = pgEnum("contest_kind", ["GROUP", "GYM"]);
export const accessMode = pgEnum("access_mode", ["AUTO", "MANAGER", "MEMBER"]);
export const participationKind = pgEnum("participation_kind", ["LIVE", "VIRTUAL", "PRACTICE_ONLY"]);
export const cellStatus = pgEnum("cell_status", ["SOLVED_LIVE", "SOLVED_VIRTUAL", "UPSOLVED", "ATTEMPTED"]);
export const syncKind = pgEnum("sync_kind", ["CONTEST", "HANDLES", "DISCOVERY", "PRACTICE"]);
export const syncTrigger = pgEnum("sync_trigger", ["ADD", "MANUAL", "CRON"]);

export type CellStatus = (typeof cellStatus.enumValues)[number];
export type ParticipationKind = (typeof participationKind.enumValues)[number];

// Batches: one row now ("Batch 1"), no switcher UI yet
export const batches = pgTable("batches", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull().unique(),
  createdAt: createdAt(),
});

// Admins: 2–5 internal users, seeded; no public signup
export const admins = pgTable("admins", {
  id: uuid("id").defaultRandom().primaryKey(),
  email: text("email").notNull().unique(), // stored lowercased
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: adminRole("role").default("admin").notNull(),
  failedLogins: integer("failed_logins").default(0).notNull(),
  lockedUntil: tsz("locked_until"),
  lastLoginAt: tsz("last_login_at"),
  createdAt: createdAt(),
});

// Students
export const students = pgTable(
  "students",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "restrict" }),
    niatId: text("niat_id").notNull().unique(), // trimmed, uppercased
    name: text("name"),
    phone: text("phone").notNull(), // +91XXXXXXXXXX
    enteredHandle: text("entered_handle").notNull(), // as the admin typed it
    cfHandle: text("cf_handle").notNull(), // current handle from user.info
    handleLower: text("handle_lower").notNull().unique(), // lower(cfHandle), used for matching
    handleStatus: handleStatus("handle_status").default("UNVERIFIED").notNull(),
    handleCheckedAt: tsz("handle_checked_at"),
    cfRating: integer("cf_rating"),
    cfMaxRating: integer("cf_max_rating"),
    cfRank: text("cf_rank"),
    cfLastOnlineAt: tsz("cf_last_online_at"),
    createdAt: createdAt(),
    updatedAt: tsz("updated_at").defaultNow().notNull().$onUpdate(() => new Date()),
  },
  (t) => [index("students_batch_idx").on(t.batchId)]
);

// Contests: group mashups and gym contests
export const contests = pgTable(
  "contests",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "restrict" }),
    cfContestId: integer("cf_contest_id").notNull(),
    kind: contestKind("kind").notNull(),
    groupCode: text("group_code"),
    sourceUrl: text("source_url").notNull(),
    title: text("title").notNull(),
    scoringType: text("scoring_type"), // Codeforces contest.type: ICPC | IOI | CF
    phase: text("phase"), // BEFORE | CODING | FINISHED | ...
    startsAt: tsz("starts_at"),
    durationSeconds: integer("duration_seconds"),
    problemCount: integer("problem_count").default(0).notNull(),
    accessMode: accessMode("access_mode").default("AUTO").notNull(),
    resolvedMode: accessMode("resolved_mode"), // MANAGER or MEMBER after the first sync
    lastSyncedAt: tsz("last_synced_at"),
    lastSyncError: text("last_sync_error"),
    createdBy: uuid("created_by").references(() => admins.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    uniqueIndex("contests_batch_cf_uidx").on(t.batchId, t.cfContestId),
    index("contests_starts_idx").on(t.startsAt),
  ]
);

// Phase 4: groups whose new contests are added automatically
export const linkedGroups = pgTable(
  "linked_groups",
  {
    batchId: uuid("batch_id").notNull().references(() => batches.id, { onDelete: "cascade" }),
    groupCode: text("group_code").notNull(),
    autoDiscover: boolean("auto_discover").default(true).notNull(),
    lastDiscoveredAt: tsz("last_discovered_at"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.batchId, t.groupCode] })]
);

// Problems of each contest, in Codeforces order
export const contestProblems = pgTable(
  "contest_problems",
  {
    contestId: uuid("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
    problemIndex: text("problem_index").notNull(),
    name: text("name").notNull(),
    maxPoints: real("max_points"), // set on IOI-scored contests
    rating: integer("rating"),
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    sortOrder: integer("sort_order").notNull(),
  },
  (t) => [primaryKey({ columns: [t.contestId, t.problemIndex] })]
);

// One row per student who took part in a contest; absent = no row
export const participations = pgTable(
  "participations",
  {
    contestId: uuid("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    kind: participationKind("kind").notNull(),
    rank: integer("rank"), // from the live or virtual row
    points: real("points").default(0).notNull(),
    penalty: integer("penalty").default(0).notNull(),
    solvedLive: integer("solved_live").default(0).notNull(),
    solvedVirtual: integer("solved_virtual").default(0).notNull(),
    upsolved: integer("upsolved").default(0).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.contestId, t.studentId] }),
    index("participations_student_idx").on(t.studentId),
  ]
);

// Non-empty matrix cells only; a missing cell = not attempted
export const problemCells = pgTable(
  "problem_cells",
  {
    contestId: uuid("contest_id").notNull().references(() => contests.id, { onDelete: "cascade" }),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    problemIndex: text("problem_index").notNull(),
    status: cellStatus("status").notNull(),
    rejectedAttempts: integer("rejected_attempts").default(0).notNull(),
    points: real("points"), // IOI partial score
    solvedAtSeconds: integer("solved_at_seconds"), // from contest start; live or virtual only
  },
  (t) => [
    primaryKey({ columns: [t.contestId, t.studentId, t.problemIndex] }),
    index("problem_cells_student_idx").on(t.studentId),
  ]
);

// Sync history and the cross-process lock
export const syncRuns = pgTable(
  "sync_runs",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    kind: syncKind("kind").notNull(),
    trigger: syncTrigger("trigger").notNull(),
    contestId: uuid("contest_id").references(() => contests.id, { onDelete: "set null" }),
    triggeredBy: uuid("triggered_by").references(() => admins.id, { onDelete: "set null" }),
    startedAt: tsz("started_at").defaultNow().notNull(),
    finishedAt: tsz("finished_at"),
    ok: boolean("ok"),
    cfCalls: integer("cf_calls").default(0).notNull(),
    error: text("error"),
  },
  (t) => [index("sync_runs_started_idx").on(t.startedAt)]
);

export const syncLocks = pgTable("sync_locks", {
  name: text("name").primaryKey(), // "codeforces"
  holder: text("holder").notNull(), // random id of the holding process
  expiresAt: tsz("expires_at").notNull(),
});

// Phase 5: practice tracking (created now, used in Phase 5)
export const submissions = pgTable(
  "submissions",
  {
    cfSubmissionId: bigint("cf_submission_id", { mode: "number" }).primaryKey(),
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    cfContestId: integer("cf_contest_id"),
    problemIndex: text("problem_index").notNull(),
    problemName: text("problem_name").notNull(),
    problemRating: integer("problem_rating"),
    tags: text("tags").array().default(sql`'{}'::text[]`).notNull(),
    verdict: text("verdict"),
    participantType: text("participant_type"),
    submittedAt: tsz("submitted_at").notNull(),
  },
  (t) => [index("submissions_student_time_idx").on(t.studentId, t.submittedAt)]
);

export const practiceSyncState = pgTable("practice_sync_state", {
  studentId: uuid("student_id").primaryKey().references(() => students.id, { onDelete: "cascade" }),
  lastSubmissionId: bigint("last_submission_id", { mode: "number" }),
  lastSyncedAt: tsz("last_synced_at"),
});

export const ratingSnapshots = pgTable(
  "rating_snapshots",
  {
    studentId: uuid("student_id").notNull().references(() => students.id, { onDelete: "cascade" }),
    takenOn: date("taken_on").notNull(),
    rating: integer("rating"),
    maxRating: integer("max_rating"),
  },
  (t) => [primaryKey({ columns: [t.studentId, t.takenOn] })]
);

// Relations
export const batchesRelations = relations(batches, ({ many }) => ({
  students: many(students),
  contests: many(contests),
}));

export const studentsRelations = relations(students, ({ one, many }) => ({
  batch: one(batches, { fields: [students.batchId], references: [batches.id] }),
  participations: many(participations),
  cells: many(problemCells),
}));

export const contestsRelations = relations(contests, ({ one, many }) => ({
  batch: one(batches, { fields: [contests.batchId], references: [batches.id] }),
  problems: many(contestProblems),
  participations: many(participations),
  cells: many(problemCells),
}));

export const contestProblemsRelations = relations(contestProblems, ({ one }) => ({
  contest: one(contests, { fields: [contestProblems.contestId], references: [contests.id] }),
}));

export const participationsRelations = relations(participations, ({ one }) => ({
  contest: one(contests, { fields: [participations.contestId], references: [contests.id] }),
  student: one(students, { fields: [participations.studentId], references: [students.id] }),
}));

export const problemCellsRelations = relations(problemCells, ({ one }) => ({
  contest: one(contests, { fields: [problemCells.contestId], references: [contests.id] }),
  student: one(students, { fields: [problemCells.studentId], references: [students.id] }),
}));

// Types
export type Admin = typeof admins.$inferSelect;
export type Student = typeof students.$inferSelect;
export type NewStudent = typeof students.$inferInsert;
export type Contest = typeof contests.$inferSelect;
export type ContestProblem = typeof contestProblems.$inferSelect;
export type Participation = typeof participations.$inferSelect;
export type ProblemCell = typeof problemCells.$inferSelect;
```

`drizzle.config.ts` and `src/db/index.ts` stay as in v1: the config points `drizzle-kit` at `DATABASE_URL_UNPOOLED`, and the app uses `drizzle(neon(DATABASE_URL), { schema })`.

## Sync engine

`syncContest(contestId)` fetches standings for the batch's verified handles and turns them into matrix cells and participation rows with one pure function. It then replaces the contest's whole snapshot in one atomic `db.batch`. A lock row makes sure only one process talks to Codeforces at a time.

### `syncContest` step by step (`src/lib/sync/contest.ts`)

1. **Take the lock** `codeforces` with a 120-second lease. A manual refresh waits up to 20 s for it, then returns `409 { error: "Another sync is running" }`.
2. **Load** the contest and its batch's students. If any are `UNVERIFIED`, run `verifyHandles()` for them first. Only `VALID` handles go to Codeforces.
3. **Fetch** `contest.standings` with `showUnofficial=true`, the access mode, and handles in chunks of 100. With no valid students, call once without `handles` and with `count=1` to get the metadata and problems.
4. **Validate** every response with zod. Take `contest` and `problems` from the first chunk and concatenate `rows` from all chunks.
5. **Merge** with `mergeStandings()` (rules below) into `cells`, `participations` and `unmatchedHandles`.
6. **Write** one `db.batch`: delete and re-insert the contest's `contest_problems`, `problem_cells` and `participations`; update the contest's metadata, `resolvedMode`, `lastSyncedAt = now()` and `lastSyncError = null`; close the `sync_runs` row. Insert at most 1,000 rows per statement to stay under Postgres's 65,535 bind-parameter limit.
7. **On error**, save `lastSyncError`, mark the run failed and keep the old snapshot. A `handles: … not found` error means a student renamed mid-week: re-verify the batch's handles and retry once.
8. **Release the lock** in `finally`.

### Merge rules (`src/lib/sync/merge.ts`, pure)

Inputs: `problems`, `rows`, `contest.type`, and a map from lowercased handle to student ID. A row's handle is `party.members[0].handle`, lowercased.

**Row type** comes from `party.participantType`:

| `participantType` | Treated as |
| --- | --- |
| `CONTESTANT`, `OUT_OF_COMPETITION` | Live |
| `VIRTUAL` | Virtual |
| `PRACTICE` | Practice (upsolve) |
| `MANAGER` | Ignored |

**Time check:** the standings page marks unofficial rows with `*`, and the Phase 0 fixture shows which `participantType` they carry. Whatever the type, a solve in a live row counts as `SOLVED_LIVE` only when `bestSubmissionTimeSeconds` is at most the contest's `durationSeconds`. A later solve counts as `UPSOLVED`.

**Solved:** `problemResults[i]` lines up with `problems[i]`. On IOI contests where `problems[i].points` is set, solved means `points >= problems[i].points`. Otherwise solved means `points > 0`.

**Cell status**, highest priority first. A student with none of these gets no cell.

1. `SOLVED_LIVE`: solved in a live row. Keep that row's `rejectedAttemptCount`, and `bestSubmissionTimeSeconds` as `solvedAtSeconds`.
2. `SOLVED_VIRTUAL`: solved in a virtual row, with the same fields.
3. `UPSOLVED`: solved only in a practice row. `rejectedAttempts` = the sum across all the student's rows, which shows the total struggle before the solve.
4. `ATTEMPTED`: not solved anywhere, but the summed `rejectedAttemptCount` is above 0 or an IOI partial score is above 0 (stored in `points`).

**Participation:** `LIVE` if the student has any live row, otherwise `VIRTUAL` if any virtual row, otherwise `PRACTICE_ONLY`. `rank`, `points` and `penalty` come from the live row, or else the virtual row. `solvedLive`, `solvedVirtual` and `upsolved` are counts of the cells. A student with no row is absent, so no participation row is written.

**Unmatched rows** (a handle not in the map) are counted in `sync_runs.error` as a warning, and that batch's handles are re-verified on the next run.

### Lock (`src/lib/sync/lock.ts`)

```sql
-- acquire: a returned row means you hold the lock
INSERT INTO sync_locks (name, holder, expires_at)
VALUES ('codeforces', $1, now() + interval '120 seconds')
ON CONFLICT (name) DO UPDATE
  SET holder = EXCLUDED.holder, expires_at = EXCLUDED.expires_at
  WHERE sync_locks.expires_at < now()
RETURNING holder;

-- release
DELETE FROM sync_locks WHERE name = 'codeforces' AND holder = $1;
```

The scheduled script takes and releases the lock once per contest, so a manual refresh can slip in between. Inside the process, the 2,100 ms queue in `cfCall()` still applies. If the lock changes hands within 2 s of the last call, the retry rule absorbs the occasional "Call limit exceeded".

### Manual refresh

v1's rule stays. `POST /api/contests/[id]/sync` returns `429 { error, retryAfterSeconds }` when `lastSyncedAt` is under 30 seconds old.

### Scheduled sync (`scripts/sync.ts` in GitHub Actions)

The scheduled sync is a plain Node script that GitHub Actions runs every 3 hours from a private repo. It writes straight to Neon, so no host time limit or sleep applies. It uses the same `syncContest()` and lock as manual refresh.

1. **Discovery (Phase 4):** for each linked group, call `contest.list?gym=true&groupCode=…` and add contests not yet tracked.
2. **Pick contests:** every run syncs contests that started in the last 21 days. The 21:47 UTC run (03:17 IST), or any run started with `--all`, syncs every contest.
3. **Sync them one by one,** oldest `lastSyncedAt` first. A failure is recorded in `sync_runs` and the loop moves on.
4. **Guard rail:** the job sets `timeout-minutes: 15`.

**Workflow** `.github/workflows/sync.yml`: schedule `47 */3 * * *` plus `workflow_dispatch`. Steps: checkout, `setup-node` with npm cache, `npm ci`, then `npx tsx scripts/sync.ts`. Secrets: `DATABASE_URL`, `CF_API_KEY`, `CF_API_SECRET`, `CF_KEY_HANDLE`.

**Cost:** at 500 students a contest takes 5 calls, about 12 s, so a nightly sweep of 50 contests takes about 10 minutes. Phase 5 adds `.github/workflows/practice.yml`, which runs `scripts/practice.ts` daily at `17 22 * * *` (03:47 IST). Together they fit the free minutes shown in the free-tier budget in Section 3.

Keep the repo private. GitHub turns off schedules in public repos after 60 days without activity.

## Student roster and CSV import

Import keeps v1's template and header aliases. It adds a server-side preview, stricter cleaning, duplicate checks within the file, and automatic handle verification after commit. Import only adds and updates; students missing from a file are never deleted.

### Template (`students_template.csv`, from the Download Sample CSV button)

```csv
niat_id,phone,cf_handle,name
NIAT2026001,+919876543210,tourist,Aarav Sharma
NIAT2026002,98765 43211,Benq,Diya Patel
NIAT2026003,09123456789,https://codeforces.com/profile/jiangly,Rohan Verma
NIAT2026004,919988776655,@ecnerwala,
```

### Header aliases (case-insensitive, unchanged from v1)

| Field | Accepted headers | Required |
| --- | --- | --- |
| `niat_id` | `niat_id`, `niat id`, `niatid`, `student_id`, `id` | Yes |
| `phone` | `phone`, `phone_number`, `phone number`, `mobile`, `contact` | Yes |
| `cf_handle` | `cf_handle`, `cf handle`, `codeforces_handle`, `codeforces handle`, `handle`, `codeforces` | Yes |
| `name` | `name`, `student_name`, `student name`, `full_name` | No (blank becomes `null`) |

### Cleaning rules (`src/lib/csv.ts` and `src/lib/phone.ts`, pure)

- Trim every cell and skip fully empty rows. Limit: 2,000 rows or 1 MB per file.
- **NIAT ID:** trim and uppercase.
- **Handle:** if the cell is a profile URL on `codeforces.com`, `mirror.codeforces.com`, `m1.codeforces.com` or `codeforces.net`, take the segment after `/profile/`. Strip a leading `@`. Reject cells with spaces or characters other than letters, digits, `_`, `-` and `.`; `user.info` is the real check.
- **Phone:** strip spaces, hyphens, dots and brackets, then normalize:
  - 10 digits starting with 6–9 → `+91` + digits
  - 11 digits starting with `0` → drop the `0`, then `+91`
  - 12 digits starting with `91`, or `+91` + 10 digits → `+91XXXXXXXXXX`
  - `+` followed by 8–15 digits → kept as an international number
  - anything else → row rejected: "Phone must be a 10-digit Indian mobile number"
- **Duplicates within the file:** a second row with the same NIAT ID or the same handle is rejected, and its message names the first row.

### Import flow (`POST /api/students/import`)

1. The dialog posts the CSV text or a JSON `rows` array with `dryRun: true`. The server returns the cleaned rows and per-row errors and writes nothing, so the preview uses the same rules as the commit.
2. The admin confirms, and the same payload is posted with `dryRun: false`.
3. Upsert by `niatId`. Existing students get `phone`, `name` and `enteredHandle` updated. If the handle changed, set `cfHandle` to the new value, recompute `handleLower` and reset `handleStatus` to `UNVERIFIED`.
4. A handle that belongs to a different student rejects only that row.
5. Response: `{ inserted, updated, failed: [{ row, niatId?, reason }], verification: { valid, invalid: [handle] } }`.
6. After the write, `verifyHandles()` runs on new or changed handles before the response returns: one Codeforces call per 100 handles, plus one per bad handle.

### `verifyHandles()` (`src/lib/sync/handles.ts`)

One unknown handle fails the whole `user.info` call, so verification loops:

1. Call `user.info` with the pending handles (chunks of 100) and `checkHistoricHandles=true`.
2. On `FAILED` with `handles: User with handle X not found`, mark X `INVALID`, remove it and call again. Stop after 20 removals per chunk.
3. On `OK`, results come back in request order, which Phase 0 confirms. Match by position. Set `cfHandle` to the returned handle (it differs after a rename), recompute `handleLower`, and set `handleStatus = VALID`, `handleCheckedAt`, `cfRating`, `cfMaxRating`, `cfRank` and `cfLastOnlineAt`.
4. A returned handle that collides with another student's `handleLower` leaves the row unchanged and logs a warning in `sync_runs`.

## Screens and features

V1 has five screens; Settings arrives in Phase 4 and Practice in Phase 5. The new Batch overview page answers the question admins ask every morning: who missed contests, and who is stuck.

| Screen | Route | Phase | Answers |
| --- | --- | --- | --- |
| Contests home | `/` | 3 | Which contests are tracked, how each went, and whether sync is healthy |
| Contest matrix | `/contests/[id]` | 3 | Who attended, who solved what, who upsolved, and who is stuck on which problem |
| Students | `/students` | 3 | Who is on the roster, whether each handle is valid, and each student's totals |
| Student detail | `/students/[niatId]` | 3 | One student's contest history and unsolved problems |
| Batch overview | `/overview` | 3 | Attendance trend and the at-risk list |
| Settings | `/settings` | 4 | Admins, password, linked groups and sync log |
| Practice | `/practice` | 5 | Rating trend, weekly solves and inactive students |

### Contests home (`/`)

- **Add Contest bar:** URL input and an **Add & Sync** button. An Advanced section holds an access mode select (Auto by default, Manager or Member).
- **Contest list,** newest first: title, Group/Gym badge, start date in IST, problem count, live attendance (`14 / 20`), average solved live, upsolve rate, 0-solved count, last synced (relative, with an error icon and tooltip when `lastSyncError` is set), and **Open**, **Refresh** and **Delete** (with a confirm dialog).
- **Errors are actionable:** "Codeforces could not show contest 734032 to `<key account>`. Make sure that account has joined group `vP4zGe21UV`, or switch access mode to Member."
- **Empty state:** an example URL and a one-line explanation of where to copy it from.

### Contest matrix (`/contests/[id]`)

- **KPI strip:** students; attended live (count and %); virtual; absent; average solved live (`X / N`); upsolve rate; fully solved; 0 solved (highlighted); last synced with **Refresh now**.
- **Upsolve rate** = upsolved cells ÷ problems that participants did not solve live or virtually.
- **Filters:** instant search over NIAT ID, name, handle and phone. Pills for All, Absent, 0 solved, In progress, Completed and Handle issue. Sort by solved (high to low or low to high), rank, or NIAT ID.
- **Sticky left columns:** NIAT ID (links to the student), name, handle (links to the Codeforces profile, with a warning icon when not `VALID`), phone (click to copy), participation badge, rank, solved (`live + virtual / N`), upsolved.
- **Problem columns** `A, B, C…`: the header shows the index and how many of the batch solved it (`12/20`); hovering shows the name and rating. Clicking the header opens the problem on Codeforces.
- **Cells** carry a symbol as well as a colour:

| Status | Badge | Tooltip |
| --- | --- | --- |
| `SOLVED_LIVE` | Green `✓` (`✓+2` after 2 wrong tries) | Solved at 01:12 in contest |
| `SOLVED_VIRTUAL` | Teal `✓v` | Solved in virtual at 00:48 |
| `UPSOLVED` | Blue `↻` | Upsolved after the contest; 3 wrong tries in total |
| `ATTEMPTED` | Amber `−3` (or the IOI score) | 3 wrong tries, not solved |
| No cell | Muted `·` | Not attempted |

- **Export CSV** of the filtered rows: NIAT ID, name, phone, handle, participation, rank, solved live, solved virtual, upsolved, then one column per problem holding `L`, `V`, `U`, `-N` or blank.
- At most 500 rows × 26 columns, which a plain table renders without virtualization.

### Students (`/students`) and Student detail (`/students/[niatId]`)

- **Roster table:** NIAT ID, name, phone, handle with status badge, rating, live attendance (`8 / 10`), total live solves, upsolves, last online. Row actions: edit and delete.
- **Toolbar:** search, **Add student** modal, **Import CSV** dialog (upload or paste, server preview, commit summary), **Download sample CSV**, **Verify all handles**.
- **Detail page:** a header card (NIAT ID, name, phone with copy button, handle, rating) and KPIs: attendance %, average solved, upsolve rate.
- **Contest history,** newest first: date, contest, participation, rank, solved live (`/ N`), upsolved, and the remaining unsolved problems as chips. Each chip links to `codeforces.com/group/{code}/contest/{id}/problem/{index}`, or to `codeforces.com/gym/{id}/problem/{index}` for gym contests.

### Batch overview (`/overview`, new)

- **Last 10 contests:** date, contest, live, virtual, absent, average solved, upsolve rate.
- **At-risk list,** each row with its reason and a phone copy button for follow-up:
  - missed the last 2 contests
  - solved 0 in the last 2 contests attended
  - handle `INVALID` or `UNVERIFIED`
  - never seen in any contest (may not have joined the group)
- **Leaderboard:** live solves + upsolves across all contests, with attendance.

### Settings (`/settings`, Phase 4)

- Change your own password (current password required).
- Admins: list, add (email, name, temporary password, role), and remove. You cannot remove yourself or the last admin.
- Linked groups: add a group code for auto-discovery, toggle it, and see when it was last checked.
- Sync log: the last 50 `sync_runs` with kind, trigger, status, duration, Codeforces calls and error.
- **Check Codeforces key:** one signed `user.info` call that proves the key and the signer still work.

### Practice (`/practice`, Phase 5)

- **Batch table:** current rating, rating change over 30 days, unique problems solved this week and over the last 4 weeks, average rating of solved problems, days since the last accepted submission. A filter shows students with no accepted submission in 7 days.
- **Student detail additions:** rating line chart, weekly solves bar chart, difficulty histogram (800–3500 in steps of 100), and solves per tag.
- **Data:** `user.info` once a day for the whole batch writes `rating_snapshots`. `user.status` per student is incremental: request `from=1&count=100` and stop at `lastSubmissionId`. The first run per student loads the full history. Both run in the daily practice script from GitHub Actions.

### UI states everywhere

Every page has a skeleton while loading, an empty state that says what to do next, and an error banner that names the fix. Times show in IST, with relative times ("12 min ago") carrying the exact time in a tooltip.

## API route contracts

Pages read data in Server Components through server-only query functions in `src/lib/queries/`, so v1's list-style `GET` routes are dropped. API routes handle only writes and manual sync triggers, which keeps them easy to test with `curl`. After a write, the client calls `router.refresh()`. CSV export is built in the browser from the rows already on screen.

Every route except login calls `verifySession()` and returns `401` without a session. Routes marked **admin** also return `403` for the `instructor` role. Errors always use one shape: `{ error: string, code: string, details?: unknown }`.

| Route | Method | Access | Request | Response |
| --- | --- | --- | --- | --- |
| `/api/auth/login` | POST | Public | `{ email, password }` | `200 { admin }`; `401` "Invalid email or password"; `429` after 5 failures (15-minute lock) |
| `/api/auth/logout` | POST | Session | — | `200 { ok: true }` |
| `/api/students` | POST | Session | `{ niatId, phone, cfHandle, name? }` | `201 { student }` after verifying the handle; `409` duplicate NIAT ID or handle |
| `/api/students/[id]` | PATCH | Session | Any of `phone`, `name`, `cfHandle` | `200 { student }`; a handle change resets to `UNVERIFIED` and re-verifies |
| `/api/students/[id]` | DELETE | Admin | — | `200 { deleted: true }` |
| `/api/students/import` | POST | Session | `{ csv }` or `{ rows }`, plus `dryRun` | Dry run: `200 { preview, failed }`. Commit: `200 { inserted, updated, failed, verification }` |
| `/api/students/verify-handles` | POST | Session | `{ studentIds? }`; default is every handle not `VALID` | `200 { valid, invalid: [handle], renamed: [{ from, to }] }` |
| `/api/contests` | POST | Session | `{ url, accessMode? }` | `201 { contest }` after the first sync. If Codeforces refuses, the contest is still saved with `lastSyncError` so it can be retried. `400` bad URL; `409` already tracked in this batch |
| `/api/contests/[id]` | PATCH | Session | `{ accessMode? }` | `200 { contest }` |
| `/api/contests/[id]` | DELETE | Admin | — | `200 { deleted: true }`; cascades to problems, cells and participations |
| `/api/contests/[id]/sync` | POST | Session | — | `200 { syncedAt, participants, cells }`; `429` cooldown with `retryAfterSeconds`; `409` another sync holds the lock |
| `/api/me/password` | POST | Session | `{ currentPassword, newPassword }` (at least 10 characters) | `200 { ok: true }` |
| `/api/admins` | GET, POST | Admin | POST: `{ email, name, tempPassword, role }` | `200 { admins }` / `201 { admin }` |
| `/api/admins/[id]` | DELETE | Admin | — | `200`; `400` for yourself or the last admin |
| `/api/groups` | GET, POST, PATCH, DELETE | Admin | `{ groupCode, autoDiscover }` | Linked groups for auto-discovery (Phase 4) |
| `/api/settings/cf-check` | POST | Admin | — | `200 { ok, keyHandle, latencyMs }` or the mapped Codeforces error |

### Contest URL parser (`src/lib/cf/parse-url.ts`, pure)

Accepted hosts are `codeforces.com`, `www.codeforces.com`, `mirror.codeforces.com`, `m1.codeforces.com` and `codeforces.net`. Trailing slashes, query strings, and suffixes such as `/standings`, `/problems`, `/problem/A` and `/status` are ignored.

- `/group/{groupCode}/contest/{contestId}` → `{ kind: "GROUP", cfContestId, groupCode }`
- `/gym/{contestId}` → `{ kind: "GYM", cfContestId, groupCode: null }`
- `/group/{groupCode}` alone → `{ kind: "GROUP_LINK", groupCode }`, accepted only by `/api/groups`
- Anything else returns `400` with "Paste a Codeforces group contest or gym link, for example https://codeforces.com/group/vP4zGe21UV/contest/734032"

## Phased plan and verification gates

There are six phases, and each ends at a gate you check before the next prompt. The new Phase 0 proves the riskiest part first, signed Codeforces calls against your real group, before any UI exists. V1 is usable after Phase 3.

&#91;embedded content: roadmap · 6 phases, 6 gates\]

Each gate is a short checklist under its phase below. Do not paste the next prompt until every item passes.

### Phase 0: Scaffold and prove Codeforces access

- [ ] Scaffold Next.js 16 (App Router, TypeScript strict, Tailwind) and initialise `shadcn/ui`. Add `vitest`, `tsx`, `dotenv` and `zod`.
- [ ] Write `src/lib/cf/sign.ts` and `src/lib/cf/client.ts` (`cfCall` with signer, 2,100 ms queue, retries, comment-prefix error mapping). Leave out the database lock for now.
- [ ] Unit-test the signer against the documentation vector in Section 4.
- [ ] Write `scripts/cf-smoke.ts`, which runs in order and saves each response to `tests/fixtures/`:
  1. `user.info` with two real student handles: proves the key, the signature and the result order.
  2. `user.info` with one real and one fake handle: records the exact "not found" comment.
  3. `contest.standings` for 734032 with `asManager=true`, then without it, two handles and `showUnofficial=true`: records which mode works and proves the `;` encoding.
  4. `contest.list?gym=true&groupCode=vP4zGe21UV`: proves group discovery.

**Gate 0**

- [ ] Call 1 returns `OK`, with results in request order.
- [ ] Call 2 returns `FAILED` with a comment starting `handles:`.
- [ ] Call 3 returns `OK` in at least one mode, and the working mode is written down.
- [ ] `npm test` passes and the fixtures are committed.

### Phase 1: Database and admin auth

- [ ] Add `drizzle.config.ts`, `src/db/index.ts` and `src/db/schema.ts` exactly as in Section 5. Generate and apply the first migration.
- [ ] `scripts/seed-admin.ts`: idempotently upserts the `Batch 1` row and the first admin from `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD`. Add `"seed": "tsx scripts/seed-admin.ts"`.
- [ ] `src/lib/auth.ts` (`createSession`, `clearSession`, `verifySession`, `requireRole`), `src/proxy.ts`, the login and logout routes, and `/login`. Lock the account for 15 minutes after 5 failed logins.
- [ ] Dashboard shell: `(dashboard)/layout.tsx` with nav (Contests, Students, Overview), admin email and Logout.

**Gate 1**

- [ ] `drizzle-kit migrate` creates all 13 tables and the enums. `npm run seed` succeeds twice in a row.
- [ ] Signed out, `/` redirects to `/login`. A wrong password shows a generic error; the 6th wrong try returns `429`.
- [ ] Logging in shows the shell; logout clears the cookie and blocks `/` again.

### Phase 2: Roster and sync engine (backend)

- [ ] `src/lib/csv.ts`, `src/lib/phone.ts` and `src/lib/cf/parse-url.ts`, with unit tests.
- [ ] `src/lib/sync/handles.ts` (`verifyHandles` with the removal loop), `lock.ts`, `merge.ts` and `contest.ts`.
- [ ] Unit-test `mergeStandings()` against the Phase 0 fixture, plus hand-made cases: live solve, virtual solve, upsolve after a wrong live try, attempted only, IOI partial score, absent.
- [ ] Routes: `/api/students` (POST), `/api/students/[id]`, `/api/students/import`, `/api/students/verify-handles`, `/api/contests` (POST), `/api/contests/[id]` (PATCH, DELETE), `/api/contests/[id]/sync`.

**Gate 2**

- [ ] `npm test` passes. A signed-out `POST /api/students` returns `401`.
- [ ] An import dry run of the sample CSV writes nothing and shows the cleaned phones. The commit marks real handles `VALID` and a fake one `INVALID`, and nothing else fails.
- [ ] Adding the contest 734032 URL returns `201`. Its problems, cells and participations match the expected results table below.
- [ ] Two refreshes within 30 s give `429`; two syncs started together give one `409`.

**Expected results for contest 734032** ("Number theory contest, batch-1", final standings as of 21 Nov 2026). Rows marked `*` on the standings page are treated as practice. No one has a cell for E or F. `✓+2` = solved live after 2 wrong tries; `↻` = upsolved; `−5` = 5 wrong tries, not solved; `·` = no cell.

| Handle | Participation | Rank | A | B | C | D |
| --- | --- | --- | --- | --- | --- | --- |
| usecarelessly18 | Live | 1 | ✓+1 | ✓+2 | ✓+1 | −1 |
| priya.m.reddy2006 | Live | 2 | ✓+1 | ✓ | · | · |
| NotMyBug | Live | 3 | ✓ | · | · | · |
| Y\_ABHILASH\_REDDY\_2710 | Live | 4 | ✓+2 | −5 | −1 | · |
| Sattunashedixd14 | Live | 5 | ✓ | · | · | · |
| gorugantisathish | Live | 6 | ↻ (1 wrong try in total) | ✓ | · | · |
| abhinavsosa23 | Live | 7 | ✓+1 | · | · | · |
| ashrithadontha1407 | Live | 8 | ✓+1 | · | · | · |
| sheelamsai5333 | Live | 9 | ✓+1 | · | · | · |
| katakamnitheesh613 | Live | 10 | ✓+2 | · | · | −1 |
| saikumar121 | Live | 11 | ✓+4 | · | · | · |
| sailokeshdivvela | Practice only | — | ↻ (1 wrong try) | · | · | · |

Totals to check against the KPI strip and the column headers:

- **Participants:** 12 (11 live, 1 practice only). Every other student on the roster shows as absent.
- **Average solved live:** 14 ÷ 11 ≈ 1.3 of 6. **Upsolved cells:** 2. **Fully solved:** 0. **0 solved among live participants:** 0.
- **Solved-by counts in the column headers:** A 12, B 3, C 1, D 0, E 0, F 0. These match the standings page's Accepted row.
- Only handles on the roster appear, so import these 12 students (or the whole batch) before adding the contest.

### Phase 3: V1 interface

- [ ] Contests home, Contest matrix, Students, Student detail and Batch overview, as in Section 8.
- [ ] Query functions in `src/lib/queries/` for each page; no client-side fetching of lists.
- [ ] Deploy to Render's free web service (or the host chosen in open question #3) and run one sync from production, which is the Cloudflare check for the host.

**Gate 3 (V1 demo)**

- [ ] In the browser: log in, import the CSV, verify handles, paste the contest URL, open the matrix, filter Absent and 0 solved, export CSV, open a student.
- [ ] Matrix totals match Codeforces for 3 students. The exported CSV opens cleanly in Google Sheets.
- [ ] `npm run build` has no TypeScript or lint errors, and a sync from the deployed app succeeds.

### Phase 4: Scheduled sync, discovery and settings

- [ ] `scripts/sync.ts`: linked-group discovery, the 21-day and nightly rules from Section 6, an `--all` flag, and the per-contest lock. Write one `sync_runs` row per contest.
- [ ] `.github/workflows/sync.yml`: schedule `47 */3 * * *` plus `workflow_dispatch`, `timeout-minutes: 15`, and the four secrets.
- [ ] `/settings`: password change, admin management, linked groups, sync log and the key check.

**Gate 4**

- [ ] A manual `workflow_dispatch` run succeeds and appears in the sync log. This is the Cloudflare check for GitHub's runners.
- [ ] A normal run skips contests older than 21 days, and `npx tsx scripts/sync.ts --all` syncs every contest.
- [ ] One run's billed time in the Actions tab is under 5 minutes for the current batch.
- [ ] A new mashup created in the linked group appears after one run. A second admin can log in right away.

### Phase 5: Practice tracking

- [ ] `src/lib/sync/practice.ts` and `scripts/practice.ts`: a daily `user.info` snapshot into `rating_snapshots`, and incremental `user.status` into `submissions` using `practice_sync_state`.
- [ ] `.github/workflows/practice.yml` at `17 22 * * *` (03:47 IST), with `timeout-minutes: 30`.
- [ ] `/practice` and the additions to the student detail page, as in Section 8.

**Gate 5**

- [ ] The first run loads full history for 3 students; a second run makes one call per student and adds only new submissions.
- [ ] One student's weekly solved count matches their Codeforces profile, and the "no accepted submission in 7 days" filter lists the right students.

## Prompts for Claude Code

Paste these one at a time, and only after the previous gate passes. Each prompt names the sections Claude Code must follow, so it does not improvise around the tricky parts.

**Phase 0** (needs `CF_API_KEY`, `CF_API_SECRET` and `CF_KEY_HANDLE` in `.env.local`, plus two real student handles)

```text
Read IMPLEMENTATION_PLAN.md completely. Implement Phase 0 only: scaffold the Next.js 16 app, write src/lib/cf/sign.ts and src/lib/cf/client.ts exactly as Section 4 describes, add the signer unit test with the documentation vector, and write scripts/cf-smoke.ts with the four calls listed in Phase 0, saving each response to tests/fixtures/. The API key belongs to my own Codeforces account (bhagi_1122, which has joined the group), and group vP4zGe21UV was created by our team's group-creation account. Use these student handles for the smoke test: usecarelessly18, gorugantisathish (the second has both a live row and a practice row, so it exercises the merge). Run the tests and the smoke script, then report each Gate 0 item as pass or fail with the evidence. Do not start Phase 1.
```

**Phase 1**

```text
Gate 0 passed. Implement Phase 1 only from IMPLEMENTATION_PLAN.md: schema.ts exactly as Section 5 (including linked_groups and the Phase 5 tables), drizzle-kit generate + migrate, the seed script (Batch 1 + first admin), src/lib/auth.ts with requireRole, src/proxy.ts, login/logout routes with the 5-failure lockout, /login, and the dashboard shell. Follow the auth boundary rule in Section 3. Run typecheck and build, then list the commands I should run for each Gate 1 item.
```

**Phase 2**

```text
Gate 1 passed. Implement Phase 2 only: csv.ts, phone.ts, parse-url.ts, sync/handles.ts, sync/lock.ts, sync/merge.ts, sync/contest.ts and the routes listed in Phase 2. Follow Section 6 exactly for the merge priority, the solved rule on IOI contests, participation, the snapshot write in one db.batch with at most 1,000 rows per insert, and the lock. Unit-test mergeStandings against tests/fixtures plus the hand-made cases listed in Phase 2. Verify with https://codeforces.com/group/vP4zGe21UV/contest/734032 and stop at Gate 2.
```

**Phase 3**

```text
Gate 2 passed. Implement Phase 3: the five V1 screens in Section 8 (Contests home, Contest matrix, Students, Student detail, Batch overview), reading data through server-only functions in src/lib/queries/. Dark, minimal, dense UI; every status badge carries a symbol as well as a colour; times in IST. Run npm run build with zero errors, then give me the click-through checklist for Gate 3.
```

**Phase 4**

```text
V1 is in use. Implement Phase 4 from IMPLEMENTATION_PLAN.md: scripts/sync.ts reusing syncContest() and the lock, with linked-group discovery, the 21-day and nightly rules from Section 6, and an --all flag; .github/workflows/sync.yml (schedule 47 */3 * * *, workflow_dispatch, timeout-minutes 15, secrets DATABASE_URL, CF_API_KEY, CF_API_SECRET, CF_KEY_HANDLE); and /settings with admins, password, linked groups, sync log and the Codeforces key check. Everything must stay on free tiers. Stop at Gate 4.
```

**Phase 5**

```text
Implement Phase 5: src/lib/sync/practice.ts and scripts/practice.ts (daily user.info snapshot into rating_snapshots, incremental user.status per student using practice_sync_state), .github/workflows/practice.yml at 17 22 * * * with timeout-minutes 30, plus /practice and the student detail additions from Section 8. Stop at Gate 5.
```

## Risks and mitigations

The biggest risk is outside your code: Codeforces can block or change its API. The plan's answer is to find out in Phase 0 and Phase 3, fail loudly, and always keep the last good snapshot on screen.

| Risk | Effect | Mitigation |
| --- | --- | --- |
| Codeforces blocks calls from the web host's or GitHub's servers (Cloudflare challenge) | Manual refresh or scheduled syncs fail | Gates 3 and 4 each run a real sync from those servers. Fallback: an admin runs npx tsx scripts/sync.ts from a laptop |
| Codeforces changes API rules again, as it did for `contest.standings` in April 2026 | Syncs fail or return a new shape | zod validation fails loudly, the old snapshot stays, and the error shows in the sync log and on the contest |
| Group manager rights are not enough for manager-mode calls on a mashup someone else created | Manager-mode call refused | `AUTO` access mode falls back to member mode and records it |
| A student never joins the group, or gives a different handle | Looks absent every time | "Never seen" flag and the at-risk list on `/overview` |
| The API secret leaks | Anyone can call Codeforces as your account | `server-only` imports and environment variables only. If exposed, delete the key on Codeforces' API settings page and make a new one |
| GitHub delays or disables the schedule | Data goes stale | Private repo, last-run time in the sync log, and manual Refresh still works |
| Phone numbers are personal data | Privacy exposure | Admin-only pages, no public routes, export only for signed-in admins, HTTPS only |
| The app is hosted on Vercel Hobby, which is for personal, non-commercial use only | A company tool on Hobby risks being paused | Default host is Render's free web service; see open question #3 |
| Render's free web service sleeps after 15 idle minutes | The first page load after a quiet spell takes up to a minute | Accept it for an internal tool. Do not ping it to keep it awake; Render asks free users not to |
| A free-tier limit is reached (Neon 1 GB or 100 CU-hours; GitHub 2,000 minutes) | Neon blocks writes or pauses compute; scheduled syncs stop | Estimated use stays under each limit (free-tier budget in Section 3). Check the Neon and GitHub usage pages once a month |

## Sources

- [Codeforces API help](https://codeforces.com/apiHelp): signing, the call limit, JSONP
- [Codeforces API methods](https://mirror.codeforces.com/apiHelp/methods): method parameters and access rules
- [Codeforces blog entry 153241](https://codeforces.com/blog/entry/153241): the 2026 `contest.standings` restriction
- [Next.js: Proxy](https://nextjs.org/docs/app/getting-started/proxy): `middleware` renamed to `proxy` in Next.js 16
- [Drizzle batch API](https://orm.drizzle.team/docs/batch-api): atomic batches on the Neon HTTP driver
- [Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines): Hobby is non-commercial only
- [Vercel cron jobs usage and pricing](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing): Hobby limited to daily cron
- [Neon Free plan limits](https://neon.com/faqs/free-plan-limits-and-quotas): 1 GB storage, 100 CU-hours a month
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions): 2,000 free minutes a month for private repos
- [Render free tier](https://render.com/docs/free): 750 instance hours, 15-minute spin-down
