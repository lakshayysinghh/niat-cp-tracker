CREATE TYPE "public"."homework_score_source" AS ENUM('IMPORT', 'MANUAL');--> statement-breakpoint
CREATE TABLE "homework_columns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"title" text NOT NULL,
	"problem_count" integer NOT NULL,
	"group_code" text,
	"cf_contest_id" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"last_imported_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "homework_scores" (
	"column_id" uuid NOT NULL,
	"student_id" uuid NOT NULL,
	"solved" integer NOT NULL,
	"source" "homework_score_source" DEFAULT 'IMPORT' NOT NULL,
	"updated_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "homework_scores_column_id_student_id_pk" PRIMARY KEY("column_id","student_id")
);
--> statement-breakpoint
CREATE TABLE "student_remarks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"student_id" uuid NOT NULL,
	"remark_date" date NOT NULL,
	"content" text NOT NULL,
	"admin_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "homework_columns" ADD CONSTRAINT "homework_columns_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_scores" ADD CONSTRAINT "homework_scores_column_id_homework_columns_id_fk" FOREIGN KEY ("column_id") REFERENCES "public"."homework_columns"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_scores" ADD CONSTRAINT "homework_scores_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "homework_scores" ADD CONSTRAINT "homework_scores_updated_by_admins_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_remarks" ADD CONSTRAINT "student_remarks_student_id_students_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."students"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_remarks" ADD CONSTRAINT "student_remarks_admin_id_admins_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."admins"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "homework_columns_batch_title_uidx" ON "homework_columns" USING btree ("batch_id","title");--> statement-breakpoint
CREATE INDEX "homework_scores_student_idx" ON "homework_scores" USING btree ("student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "student_remarks_student_date_uidx" ON "student_remarks" USING btree ("student_id","remark_date");--> statement-breakpoint
CREATE INDEX "student_remarks_date_idx" ON "student_remarks" USING btree ("remark_date");