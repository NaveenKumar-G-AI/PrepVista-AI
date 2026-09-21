CREATE TYPE "public"."evidence_source_type" AS ENUM('SELF_REPORT', 'TRAINING', 'CERTIFICATE', 'ASSESSMENT', 'CODING_TEST', 'PROJECT', 'SIMULATION', 'MOCK_INTERVIEW', 'INTERVIEW', 'RESUME', 'PORTFOLIO', 'OPPORTUNITY_OUTCOME');--> statement-breakpoint
CREATE TYPE "public"."readiness_state" AS ENUM('UNKNOWN', 'EXPLORING', 'BUILDING', 'DEVELOPING', 'VALIDATING', 'READY_TO_TEST', 'STRONG_EVIDENCE');--> statement-breakpoint
CREATE TYPE "public"."required_level" AS ENUM('BASIC', 'INTERMEDIATE', 'STRONG');--> statement-breakpoint
CREATE TYPE "public"."validation_state" AS ENUM('UNVALIDATED', 'SELF_ASSERTED', 'VALIDATED', 'DISPUTED');--> statement-breakpoint
CREATE TABLE "capabilities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"freshness_window_days" integer DEFAULT 210 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "evidence_items" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"source_type" "evidence_source_type" NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"score" real,
	"outcome" text,
	"context" text,
	"validation_state" "validation_state" DEFAULT 'UNVALIDATED' NOT NULL,
	"claimed_level" "required_level",
	"external_ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunities" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"title" text NOT NULL,
	"external_ref_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "opportunity_capability_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"opportunity_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"required_level" "required_level" NOT NULL,
	"importance" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_audit_logs" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role_id" text NOT NULL,
	"from_state" text,
	"to_state" text NOT NULL,
	"reason" text NOT NULL,
	"triggered_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "readiness_snapshots" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role_id" text NOT NULL,
	"state" "readiness_state" NOT NULL,
	"confidence" text NOT NULL,
	"top_gap_capability_id" text,
	"reason_summary" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_capability_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"role_id" text NOT NULL,
	"capability_id" text NOT NULL,
	"required_level" "required_level" NOT NULL,
	"importance" integer DEFAULT 2 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_profiles" (
	"id" text PRIMARY KEY NOT NULL,
	"tenant_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "student_role_targets" (
	"id" text PRIMARY KEY NOT NULL,
	"student_id" text NOT NULL,
	"tenant_id" text NOT NULL,
	"role_id" text NOT NULL,
	"is_primary" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "evidence_items" ADD CONSTRAINT "evidence_items_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_capability_requirements" ADD CONSTRAINT "opportunity_capability_requirements_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "opportunity_capability_requirements" ADD CONSTRAINT "opportunity_capability_requirements_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_capability_requirements" ADD CONSTRAINT "role_capability_requirements_role_id_role_profiles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_capability_requirements" ADD CONSTRAINT "role_capability_requirements_capability_id_capabilities_id_fk" FOREIGN KEY ("capability_id") REFERENCES "public"."capabilities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "student_role_targets" ADD CONSTRAINT "student_role_targets_role_id_role_profiles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."role_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "capabilities_tenant_name_unique" ON "capabilities" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE INDEX "capabilities_tenant_idx" ON "capabilities" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "evidence_items_student_cap_idx" ON "evidence_items" USING btree ("student_id","capability_id");--> statement-breakpoint
CREATE INDEX "evidence_items_tenant_idx" ON "evidence_items" USING btree ("tenant_id");--> statement-breakpoint
CREATE INDEX "evidence_items_student_occurred_idx" ON "evidence_items" USING btree ("student_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "opp_cap_req_unique" ON "opportunity_capability_requirements" USING btree ("opportunity_id","capability_id");--> statement-breakpoint
CREATE INDEX "readiness_audit_logs_idx" ON "readiness_audit_logs" USING btree ("student_id","role_id","created_at");--> statement-breakpoint
CREATE INDEX "readiness_snapshots_student_role_created_idx" ON "readiness_snapshots" USING btree ("student_id","role_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "role_cap_req_unique" ON "role_capability_requirements" USING btree ("role_id","capability_id");--> statement-breakpoint
CREATE INDEX "role_cap_req_role_idx" ON "role_capability_requirements" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "role_profiles_tenant_name_unique" ON "role_profiles" USING btree ("tenant_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "student_role_targets_unique" ON "student_role_targets" USING btree ("student_id","role_id");--> statement-breakpoint
CREATE INDEX "student_role_targets_student_idx" ON "student_role_targets" USING btree ("student_id");