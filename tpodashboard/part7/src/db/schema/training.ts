import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---- Training Program (spec §10, §11) ----------------------------------

export const trainingProgramStatusEnum = pgEnum("training_program_status", [
  "DRAFT",
  "SCHEDULED",
  "OPEN",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
  "ARCHIVED",
]);

export const trainingProgram = pgTable(
  "training_program",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    seasonId: text("season_id").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    categoryId: text("category_id").notNull(), // -> taxonomy_term
    targetSkillIds: text("target_skill_ids").array().notNull().default([]),
    trainerUserId: text("trainer_user_id"),
    capacity: integer("capacity"),
    startDate: timestamp("start_date", { withTimezone: true }),
    endDate: timestamp("end_date", { withTimezone: true }),
    status: trainingProgramStatusEnum("status").notNull().default("DRAFT"),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("training_program_institution_season_status_idx").on(t.institutionId, t.seasonId, t.status)]
);

// Valid status transitions (spec §11 — "Validate transitions")
export const TRAINING_PROGRAM_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["SCHEDULED", "CANCELLED"],
  SCHEDULED: ["OPEN", "CANCELLED"],
  OPEN: ["IN_PROGRESS", "CANCELLED"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED"],
  COMPLETED: ["ARCHIVED"],
  CANCELLED: ["ARCHIVED"],
  ARCHIVED: [],
};

// ---- Cohorts (spec §12) --------------------------------------------------

export const cohortRuleTypeEnum = pgEnum("cohort_rule_type", [
  "STATIC",
  "DEPARTMENT",
  "READINESS_SEGMENT",
  "SKILL_GAP",
  "CUSTOM",
]);

export const trainingCohort = pgTable(
  "training_cohort",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    seasonId: text("season_id").notNull(),
    name: text("name").notNull(),
    ruleType: cohortRuleTypeEnum("rule_type").notNull(),
    rule: jsonb("rule").$type<Record<string, unknown> | null>(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("training_cohort_institution_season_idx").on(t.institutionId, t.seasonId)]
);

export const trainingCohortMember = pgTable(
  "training_cohort_member",
  {
    id: text("id").primaryKey(),
    cohortId: text("cohort_id")
      .notNull()
      .references(() => trainingCohort.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    addedAt: timestamp("added_at", { withTimezone: true }).notNull().defaultNow(),
    addedBy: text("added_by").notNull(),
  },
  (t) => [uniqueIndex("training_cohort_member_unique").on(t.cohortId, t.studentId)]
);

// ---- Sessions (spec §13) --------------------------------------------------

export const sessionModeEnum = pgEnum("session_mode", ["IN_PERSON", "ONLINE", "HYBRID"]);
export const sessionStatusEnum = pgEnum("session_status", [
  "SCHEDULED",
  "IN_PROGRESS",
  "COMPLETED",
  "CANCELLED",
]);

export const trainingSession = pgTable(
  "training_session",
  {
    id: text("id").primaryKey(),
    trainingProgramId: text("training_program_id")
      .notNull()
      .references(() => trainingProgram.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    scheduledAt: timestamp("scheduled_at", { withTimezone: true }).notNull(),
    durationMinutes: integer("duration_minutes").notNull(),
    location: text("location"),
    mode: sessionModeEnum("mode").notNull(),
    trainerUserId: text("trainer_user_id"),
    capacity: integer("capacity"),
    status: sessionStatusEnum("status").notNull().default("SCHEDULED"),
    notes: text("notes"),
  },
  (t) => [index("training_session_program_scheduled_idx").on(t.trainingProgramId, t.scheduledAt)]
);

// ---- Enrollment (spec §16) -------------------------------------------------

export const enrollmentStatusEnum = pgEnum("enrollment_status", [
  "ASSIGNED",
  "ENROLLED",
  "IN_PROGRESS",
  "COMPLETED",
  "DROPPED",
  "INACTIVE",
]);

export const trainingEnrollment = pgTable(
  "training_enrollment",
  {
    id: text("id").primaryKey(),
    trainingProgramId: text("training_program_id")
      .notNull()
      .references(() => trainingProgram.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    assignedBy: text("assigned_by").notNull(),
    assignmentReason: text("assignment_reason"),
    sourceCohortId: text("source_cohort_id"),
    status: enrollmentStatusEnum("status").notNull().default("ASSIGNED"),
    enrolledAt: timestamp("enrolled_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("training_enrollment_program_student_unique").on(t.trainingProgramId, t.studentId), // spec §16: no duplicate enrollment
    index("training_enrollment_student_idx").on(t.studentId),
  ]
);

export const ENROLLMENT_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ["ENROLLED", "DROPPED", "INACTIVE"],
  ENROLLED: ["IN_PROGRESS", "DROPPED", "INACTIVE"],
  IN_PROGRESS: ["COMPLETED", "DROPPED", "INACTIVE"],
  COMPLETED: [],
  DROPPED: ["ENROLLED"],
  INACTIVE: ["ENROLLED"],
};

// ---- Attendance (spec §14) -------------------------------------------------

export const attendanceStatusEnum = pgEnum("attendance_status", [
  "PRESENT",
  "ABSENT",
  "LATE",
  "EXCUSED",
]);

export const trainingAttendance = pgTable(
  "training_attendance",
  {
    id: text("id").primaryKey(),
    sessionId: text("session_id")
      .notNull()
      .references(() => trainingSession.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    status: attendanceStatusEnum("status").notNull(),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    recordedBy: text("recorded_by").notNull(), // spec §14: never self-marked; enforced in service layer
  },
  (t) => [
    uniqueIndex("training_attendance_session_student_unique").on(t.sessionId, t.studentId),
    index("training_attendance_student_idx").on(t.studentId),
  ]
);
