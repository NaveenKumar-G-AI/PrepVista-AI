CREATE TABLE `graph_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`version_label` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`effective_from` integer,
	`effective_to` integer,
	`notes` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `question_skill_mappings` (
	`id` text PRIMARY KEY NOT NULL,
	`question_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`is_primary` integer DEFAULT false NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skill_evidence_events` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`event_type` text NOT NULL,
	`is_correct` integer,
	`weight` real DEFAULT 1 NOT NULL,
	`source_ref` text,
	`occurred_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skill_relationships` (
	`id` text PRIMARY KEY NOT NULL,
	`from_skill_id` text NOT NULL,
	`to_skill_id` text NOT NULL,
	`relationship_type` text NOT NULL,
	`weight` real DEFAULT 1 NOT NULL,
	`confidence` text DEFAULT 'MODERATE' NOT NULL,
	`source` text NOT NULL,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`rationale` text,
	`graph_version_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`from_skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`to_skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`graph_version_id`) REFERENCES `graph_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`display_name` text NOT NULL,
	`domain` text NOT NULL,
	`level` text NOT NULL,
	`description` text,
	`status` text DEFAULT 'DRAFT' NOT NULL,
	`parent_id` text,
	`graph_version_id` text NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`graph_version_id`) REFERENCES `graph_versions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `student_skill_states` (
	`id` text PRIMARY KEY NOT NULL,
	`student_id` text NOT NULL,
	`skill_id` text NOT NULL,
	`capability` real,
	`state` text DEFAULT 'UNKNOWN' NOT NULL,
	`trend` text,
	`evidence_count` integer DEFAULT 0 NOT NULL,
	`confidence` text DEFAULT 'NONE' NOT NULL,
	`last_evaluated_at` integer,
	`mastery_source_ref` text,
	`retention_source_ref` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`skill_id`) REFERENCES `skills`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `graph_versions_version_label_unique` ON `graph_versions` (`version_label`);--> statement-breakpoint
CREATE INDEX `graph_versions_status_idx` ON `graph_versions` (`status`);--> statement-breakpoint
CREATE INDEX `qsm_question_idx` ON `question_skill_mappings` (`question_id`);--> statement-breakpoint
CREATE INDEX `qsm_skill_idx` ON `question_skill_mappings` (`skill_id`);--> statement-breakpoint
CREATE INDEX `see_student_skill_idx` ON `skill_evidence_events` (`student_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `see_event_type_idx` ON `skill_evidence_events` (`event_type`);--> statement-breakpoint
CREATE UNIQUE INDEX `skill_relationships_unique_edge` ON `skill_relationships` (`from_skill_id`,`to_skill_id`,`relationship_type`);--> statement-breakpoint
CREATE INDEX `skill_relationships_from_idx` ON `skill_relationships` (`from_skill_id`);--> statement-breakpoint
CREATE INDEX `skill_relationships_to_idx` ON `skill_relationships` (`to_skill_id`);--> statement-breakpoint
CREATE INDEX `skill_relationships_type_idx` ON `skill_relationships` (`relationship_type`);--> statement-breakpoint
CREATE INDEX `skill_relationships_status_idx` ON `skill_relationships` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `skills_code_unique` ON `skills` (`code`);--> statement-breakpoint
CREATE INDEX `skills_domain_idx` ON `skills` (`domain`);--> statement-breakpoint
CREATE INDEX `skills_parent_idx` ON `skills` (`parent_id`);--> statement-breakpoint
CREATE INDEX `skills_level_idx` ON `skills` (`level`);--> statement-breakpoint
CREATE INDEX `skills_status_idx` ON `skills` (`status`);--> statement-breakpoint
CREATE UNIQUE INDEX `sss_unique_student_skill` ON `student_skill_states` (`student_id`,`skill_id`);--> statement-breakpoint
CREATE INDEX `sss_student_idx` ON `student_skill_states` (`student_id`);--> statement-breakpoint
CREATE INDEX `sss_skill_idx` ON `student_skill_states` (`skill_id`);--> statement-breakpoint
CREATE INDEX `sss_state_idx` ON `student_skill_states` (`state`);