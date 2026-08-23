CREATE TYPE "public"."user_role" AS ENUM('TPO_HEAD', 'PLACEMENT_OFFICER', 'DEPT_COORDINATOR', 'FACULTY', 'STUDENT', 'MANAGEMENT');--> statement-breakpoint
CREATE TYPE "public"."taxonomy_domain" AS ENUM('TRAINING_CATEGORY', 'ASSESSMENT_CATEGORY', 'INTERVENTION_TYPE');--> statement-breakpoint
CREATE TYPE "public"."attendance_status" AS ENUM('PRESENT', 'ABSENT', 'LATE', 'EXCUSED');--> statement-breakpoint
CREATE TYPE "public"."cohort_rule_type" AS ENUM('STATIC', 'DEPARTMENT', 'READINESS_SEGMENT', 'SKILL_GAP', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."enrollment_status" AS ENUM('ASSIGNED', 'ENROLLED', 'IN_PROGRESS', 'COMPLETED', 'DROPPED', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."session_mode" AS ENUM('IN_PERSON', 'ONLINE', 'HYBRID');--> statement-breakpoint
CREATE TYPE "public"."session_status" AS ENUM('SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."training_program_status" AS ENUM('DRAFT', 'SCHEDULED', 'OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."assessment_version_status" AS ENUM('DRAFT', 'PUBLISHED', 'RETIRED');--> statement-breakpoint
CREATE TYPE "public"."attempt_source" AS ENUM('WEB', 'TPO_ENTRY', 'IMPORT');--> statement-breakpoint
CREATE TYPE "public"."attempt_status" AS ENUM('NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'ABANDONED', 'INVALIDATED');--> statement-breakpoint
CREATE TYPE "public"."question_type" AS ENUM('MCQ', 'MULTI_SELECT', 'CODING', 'TEXT', 'RATING', 'PRACTICAL', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."evidence_type" AS ENUM('ASSESSMENT', 'MOCK_INTERVIEW', 'TRAINING_EVALUATION', 'TPO_EVALUATION', 'STUDENT_EVIDENCE', 'PLACEMENT_INTERVIEW');--> statement-breakpoint
CREATE TYPE "public"."readiness_momentum" AS ENUM('RISING', 'STABLE', 'DECLINING', 'INSUFFICIENT_DATA');--> statement-breakpoint
CREATE TYPE "public"."risk_level" AS ENUM('LOW', 'MEDIUM', 'HIGH', 'CRITICAL', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."intervention_assignment_status" AS ENUM('ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'COMPLETED', 'OVERDUE', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."intervention_type" AS ENUM('TRAINING', 'COACHING', 'MOCK_INTERVIEW', 'RESUME_REVIEW', 'ASSESSMENT_RETAKE', 'FACULTY_MENTORING', 'PLACEMENT_COUNSELLING', 'CUSTOM');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('LOW', 'MEDIUM', 'HIGH');--> statement-breakpoint
CREATE TABLE "application" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"drive_id" text NOT NULL,
	"status" text NOT NULL,
	"applied_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "institution" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_result" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"application_id" text,
	"outcome" text NOT NULL,
	"interviewed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "offer" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"application_id" text,
	"status" text NOT NULL,
	"offered_at" timestamp with time zone DEFAULT now() NOT NULL,
	"joined_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "season" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "skill" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"category" text
);
--> statement-breakpoint
CREATE TABLE "student" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"batch" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_account" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"role" "user_role" NOT NULL,
	"scope_department" text,
	"linked_student_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "taxonomy_term" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"domain" "taxonomy_domain" NOT NULL,
	"code" text NOT NULL,
	"label" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_attendance" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"student_id" text NOT NULL,
	"status" "attendance_status" NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"recorded_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_cohort" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"rule_type" "cohort_rule_type" NOT NULL,
	"rule" jsonb,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_cohort_member" (
	"id" text PRIMARY KEY NOT NULL,
	"cohort_id" text NOT NULL,
	"student_id" text NOT NULL,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	"added_by" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_enrollment" (
	"id" text PRIMARY KEY NOT NULL,
	"training_program_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"assignment_reason" text,
	"source_cohort_id" text,
	"status" "enrollment_status" DEFAULT 'ASSIGNED' NOT NULL,
	"enrolled_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "training_program" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"category_id" text NOT NULL,
	"target_skill_ids" text[] DEFAULT '{}' NOT NULL,
	"trainer_user_id" text,
	"capacity" integer,
	"start_date" timestamp with time zone,
	"end_date" timestamp with time zone,
	"status" "training_program_status" DEFAULT 'DRAFT' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "training_session" (
	"id" text PRIMARY KEY NOT NULL,
	"training_program_id" text NOT NULL,
	"title" text NOT NULL,
	"scheduled_at" timestamp with time zone NOT NULL,
	"duration_minutes" integer NOT NULL,
	"location" text,
	"mode" "session_mode" NOT NULL,
	"trainer_user_id" text,
	"capacity" integer,
	"status" "session_status" DEFAULT 'SCHEDULED' NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "assessment" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"name" text NOT NULL,
	"category_id" text NOT NULL,
	"skill_ids" text[] DEFAULT '{}' NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_attempt" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_version_id" text NOT NULL,
	"student_id" text NOT NULL,
	"attempt_number" integer NOT NULL,
	"status" "attempt_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"source" "attempt_source" DEFAULT 'WEB' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"needs_review" boolean DEFAULT false NOT NULL,
	"review_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_question" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_version_id" text NOT NULL,
	"type" "question_type" NOT NULL,
	"prompt" text NOT NULL,
	"options" jsonb,
	"correct_answer" jsonb,
	"skill_id" text,
	"max_score" double precision NOT NULL,
	"order" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assessment_result" (
	"id" text PRIMARY KEY NOT NULL,
	"attempt_id" text NOT NULL,
	"total_score" double precision NOT NULL,
	"normalized_score" double precision NOT NULL,
	"skill_breakdown" jsonb NOT NULL,
	"evaluation_source" text NOT NULL,
	"evaluated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_result_attempt_id_unique" UNIQUE("attempt_id")
);
--> statement-breakpoint
CREATE TABLE "assessment_version" (
	"id" text PRIMARY KEY NOT NULL,
	"assessment_id" text NOT NULL,
	"version" integer NOT NULL,
	"duration_mins" integer NOT NULL,
	"max_score" double precision NOT NULL,
	"passing_score" double precision,
	"status" "assessment_version_status" DEFAULT 'DRAFT' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "skill_measurement" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"skill_id" text NOT NULL,
	"score" double precision NOT NULL,
	"evidence_type" "evidence_type" NOT NULL,
	"evidence_ref_id" text,
	"evidence_ref_type" text,
	"measured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notes" text
);
--> statement-breakpoint
CREATE TABLE "readiness_snapshot" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"season_id" text NOT NULL,
	"overall_score" double precision,
	"category_scores" jsonb NOT NULL,
	"risk_level" "risk_level" NOT NULL,
	"momentum" "readiness_momentum" NOT NULL,
	"calculated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"calculation_version" text NOT NULL,
	"source_summary" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervention" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"season_id" text NOT NULL,
	"name" text NOT NULL,
	"type" "intervention_type" NOT NULL,
	"objective" text NOT NULL,
	"target_skill_id" text,
	"priority" "priority" NOT NULL,
	"created_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "intervention_assignment" (
	"id" text PRIMARY KEY NOT NULL,
	"intervention_id" text NOT NULL,
	"student_id" text NOT NULL,
	"assigned_by" text NOT NULL,
	"reason" text NOT NULL,
	"evidence" jsonb,
	"priority" "priority" NOT NULL,
	"due_date" timestamp with time zone,
	"status" "intervention_assignment_status" DEFAULT 'ASSIGNED' NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"acknowledged_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"actor_id" text,
	"actor_role" text,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_success_event" (
	"id" text PRIMARY KEY NOT NULL,
	"institution_id" text NOT NULL,
	"student_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "training_attendance" ADD CONSTRAINT "training_attendance_session_id_training_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."training_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_cohort_member" ADD CONSTRAINT "training_cohort_member_cohort_id_training_cohort_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."training_cohort"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_enrollment" ADD CONSTRAINT "training_enrollment_training_program_id_training_program_id_fk" FOREIGN KEY ("training_program_id") REFERENCES "public"."training_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "training_session" ADD CONSTRAINT "training_session_training_program_id_training_program_id_fk" FOREIGN KEY ("training_program_id") REFERENCES "public"."training_program"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_attempt" ADD CONSTRAINT "assessment_attempt_assessment_version_id_assessment_version_id_fk" FOREIGN KEY ("assessment_version_id") REFERENCES "public"."assessment_version"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_question" ADD CONSTRAINT "assessment_question_assessment_version_id_assessment_version_id_fk" FOREIGN KEY ("assessment_version_id") REFERENCES "public"."assessment_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_result" ADD CONSTRAINT "assessment_result_attempt_id_assessment_attempt_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."assessment_attempt"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assessment_version" ADD CONSTRAINT "assessment_version_assessment_id_assessment_id_fk" FOREIGN KEY ("assessment_id") REFERENCES "public"."assessment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intervention_assignment" ADD CONSTRAINT "intervention_assignment_intervention_id_intervention_id_fk" FOREIGN KEY ("intervention_id") REFERENCES "public"."intervention"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "taxonomy_term_institution_domain_code_unique" ON "taxonomy_term" USING btree ("institution_id","domain","code");--> statement-breakpoint
CREATE INDEX "taxonomy_term_institution_domain_idx" ON "taxonomy_term" USING btree ("institution_id","domain");--> statement-breakpoint
CREATE UNIQUE INDEX "training_attendance_session_student_unique" ON "training_attendance" USING btree ("session_id","student_id");--> statement-breakpoint
CREATE INDEX "training_attendance_student_idx" ON "training_attendance" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "training_cohort_institution_season_idx" ON "training_cohort" USING btree ("institution_id","season_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_cohort_member_unique" ON "training_cohort_member" USING btree ("cohort_id","student_id");--> statement-breakpoint
CREATE UNIQUE INDEX "training_enrollment_program_student_unique" ON "training_enrollment" USING btree ("training_program_id","student_id");--> statement-breakpoint
CREATE INDEX "training_enrollment_student_idx" ON "training_enrollment" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "training_program_institution_season_status_idx" ON "training_program" USING btree ("institution_id","season_id","status");--> statement-breakpoint
CREATE INDEX "training_session_program_scheduled_idx" ON "training_session" USING btree ("training_program_id","scheduled_at");--> statement-breakpoint
CREATE INDEX "assessment_institution_idx" ON "assessment" USING btree ("institution_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_attempt_version_student_attempt_unique" ON "assessment_attempt" USING btree ("assessment_version_id","student_id","attempt_number");--> statement-breakpoint
CREATE INDEX "assessment_attempt_student_idx" ON "assessment_attempt" USING btree ("student_id");--> statement-breakpoint
CREATE INDEX "assessment_question_version_idx" ON "assessment_question" USING btree ("assessment_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "assessment_version_assessment_version_unique" ON "assessment_version" USING btree ("assessment_id","version");--> statement-breakpoint
CREATE INDEX "skill_measurement_student_skill_idx" ON "skill_measurement" USING btree ("student_id","skill_id","measured_at");--> statement-breakpoint
CREATE INDEX "readiness_snapshot_student_calculated_idx" ON "readiness_snapshot" USING btree ("student_id","calculated_at");--> statement-breakpoint
CREATE INDEX "intervention_institution_season_idx" ON "intervention" USING btree ("institution_id","season_id");--> statement-breakpoint
CREATE INDEX "intervention_assignment_student_status_idx" ON "intervention_assignment" USING btree ("student_id","status");--> statement-breakpoint
CREATE INDEX "intervention_assignment_intervention_idx" ON "intervention_assignment" USING btree ("intervention_id");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_institution_created_idx" ON "audit_log" USING btree ("institution_id","created_at");--> statement-breakpoint
CREATE INDEX "student_success_event_student_occurred_idx" ON "student_success_event" USING btree ("student_id","occurred_at");