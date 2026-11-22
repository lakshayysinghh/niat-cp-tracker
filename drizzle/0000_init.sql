CREATE TYPE "public"."access_mode" AS ENUM('AUTO', 'MANAGER', 'MEMBER');--> statement-breakpoint
CREATE TYPE "public"."admin_role" AS ENUM('admin', 'instructor');--> statement-breakpoint
CREATE TYPE "public"."cell_status" AS ENUM('SOLVED_LIVE', 'SOLVED_VIRTUAL', 'UPSOLVED', 'ATTEMPTED');--> statement-breakpoint
CREATE TYPE "public"."contest_kind" AS ENUM('GROUP', 'GYM');--> statement-breakpoint
CREATE TYPE "public"."handle_status" AS ENUM('UNVERIFIED', 'VALID', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."participation_kind" AS ENUM('LIVE', 'VIRTUAL', 'PRACTICE_ONLY');--> statement-breakpoint
CREATE TYPE "public"."sync_kind" AS ENUM('CONTEST', 'HANDLES', 'DISCOVERY', 'PRACTICE');--> statement-breakpoint
CREATE TYPE "public"."sync_trigger" AS ENUM('ADD', 'MANUAL', 'CRON');--> statement-breakpoint
CREATE TABLE "admins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "admin_role" DEFAULT 'admin' NOT NULL,
	"failed_logins" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "batches_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "contest_problems" (
	"contest_id" uuid NOT NULL,
	"problem_index" text NOT NULL,
	"name" text NOT NULL,
	"max_points" real,
	"rating" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer NOT NULL,
	CONSTRAINT "contest_problems_contest_id_problem_index_pk" PRIMARY KEY("contest_id","problem_index")
);
--> statement-breakpoint
CREATE TABLE "contests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"cf_contest_id" integer NOT NULL,
	"kind" "contest_kind" NOT NULL,
	"group_code" text,
	"source_url" text NOT NULL,
	"title" text NOT NULL,
	"scoring_type" text,
	"phase" text,
	"starts_at" timestamp with time zone,
	"duration_seconds" integer,
	"problem_count" integer DEFAULT 0 NOT NULL,
	"access_mode" "access_mode" DEFAULT 'AUTO' NOT NULL,
	"resolved_mode" "access_mode",
	"last_synced_at" timestamp with time zone,
	"last_sync_error" text,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "linked_groups" (
	"batch_id" uuid NOT NULL,
	"group_code" text NOT NULL,
	"auto_discover" boolean DEFAULT true NOT NULL,
	"last_discovered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "linked_groups_batch_id_group_code_pk" PRIMARY KEY("batch_id","group_code")
);
--> statement-breakpoint
CREATE TABLE "participations" (
	"contest_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"kind" "participation_kind" NOT NULL,
	"rank" integer,
	"points" real DEFAULT 0 NOT NULL,
	"penalty" integer DEFAULT 0 NOT NULL,
	"solved_live" integer DEFAULT 0 NOT NULL,
	"solved_virtual" integer DEFAULT 0 NOT NULL,
	"upsolved" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "participations_contest_id_student_id_pk" PRIMARY KEY("contest_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "practice_sync_state" (
	"student_id" uuid PRIMARY KEY NOT NULL,
	"last_submission_id" bigint,
	"last_synced_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "problem_cells" (
	"contest_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"problem_index" text NOT NULL,
	"status" "cell_status" NOT NULL,
	"rejected_attempts" integer DEFAULT 0 NOT NULL,
	"points" real,
	"solved_at_seconds" integer,
	CONSTRAINT "problem_cells_contest_id_student_id_problem_index_pk" PRIMARY KEY("contest_id","student_id","problem_index")
);
--> statement-breakpoint
CREATE TABLE "rating_snapshots" (
	"student_id" uuid NOT NULL,
	"taken_on" date NOT NULL,
	"rating" integer,
	"max_rating" integer,
	CONSTRAINT "rating_snapshots_student_id_taken_on_pk" PRIMARY KEY("student_id","taken_on")
);
--> statement-breakpoint
CREATE TABLE "students" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"niat_id" text NOT NULL,
	"name" text,
	"phone" text NOT NULL,
	"entered_handle" text NOT NULL,
	"cf_handle" text NOT NULL,
	"handle_lower" text NOT NULL,
	"handle_status" "handle_status" DEFAULT 'UNVERIFIED' NOT NULL,
	"handle_checked_at" timestamp with time zone,
	"cf_rating" integer,
	"cf_max_rating" integer,
	"cf_rank" text,
	"cf_last_online_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "students_niat_id_unique" UNIQUE("niat_id"),
	CONSTRAINT "students_handle_lower_unique" UNIQUE("handle_lower")
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"cf_submission_id" bigint PRIMARY KEY NOT NULL,
	"student_id" uuid NOT NULL,
	"cf_contest_id" integer,
	"problem_index" text NOT NULL,
	"problem_name" text NOT NULL,
	"problem_rating" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"verdict" text,
	"participant_type" text,
	"submitted_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_locks" (
	"name" text PRIMARY KEY NOT NULL,
	"holder" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "sync_kind" NOT NULL,
	"trigger" "sync_trigger" NOT NULL,
	"contest_id" uuid,
	"triggered_by" uuid,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"cf_calls" integer DEFAULT 0 NOT NULL,
	"error" text
);
--> statement-breakpoint
ALTER TABLE "contest_problems" ADD CONSTRAINT "contest_problems_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contests" ADD CONSTRAINT "contests_created_by_admins_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "linked_groups" ADD CONSTRAINT "linked_groups_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "participations" ADD CONSTRAINT "participations_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "practice_sync_state" ADD CONSTRAINT "practice_sync_state_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_cells" ADD CONSTRAINT "problem_cells_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_cells" ADD CONSTRAINT "problem_cells_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rating_snapshots" ADD CONSTRAINT "rating_snapshots_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "students" ADD CONSTRAINT "students_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_contest_id_contests_id_fk" FOREIGN KEY ("contest_id") REFERENCES "public"."contests"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sync_runs" ADD CONSTRAINT "sync_runs_triggered_by_admins_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contests_batch_cf_uidx" ON "contests" USING btree ("batch_id","cf_contest_id");--> statement-breakpoint
CREATE INDEX "contests_starts_idx" ON "contests" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "participations_student_idx" ON "participations" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "problem_cells_student_idx" ON "problem_cells" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "students_batch_idx" ON "students" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "submissions_student_time_idx" ON "submissions" USING btree ("student_id","submitted_at");--> statement-breakpoint
CREATE INDEX "sync_runs_started_idx" ON "sync_runs" USING btree ("started_at");