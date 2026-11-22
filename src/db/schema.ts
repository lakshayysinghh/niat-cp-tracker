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
    college: text("college"), // added in Phase 3 (optional)
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
