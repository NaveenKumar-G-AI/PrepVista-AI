import { pgTable, pgEnum, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";

export const interventionTypeEnum = pgEnum("intervention_type", [
  "TRAINING",
  "COACHING",
  "MOCK_INTERVIEW",
  "RESUME_REVIEW",
  "ASSESSMENT_RETAKE",
  "FACULTY_MENTORING",
  "PLACEMENT_COUNSELLING",
  "CUSTOM",
]);

export const priorityEnum = pgEnum("priority", ["LOW", "MEDIUM", "HIGH"]);

export const intervention = pgTable(
  "intervention",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    seasonId: text("season_id").notNull(),
    name: text("name").notNull(),
    type: interventionTypeEnum("type").notNull(),
    objective: text("objective").notNull(),
    targetSkillId: text("target_skill_id"),
    priority: priorityEnum("priority").notNull(),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("intervention_institution_season_idx").on(t.institutionId, t.seasonId)]
);

export const interventionAssignmentStatusEnum = pgEnum("intervention_assignment_status", [
  "ASSIGNED",
  "ACKNOWLEDGED",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
  "CANCELLED",
]);

/** `reason` + `evidence` exist because "why was this student selected" is
 *  load-bearing for TPO trust (spec §38) — never leave it implicit.
 *  `linkedEnrollmentId` is optional and TPO-set: when an intervention IS a
 *  specific training program enrollment, linking it lets the student action
 *  plan show real "3/5 sessions attended" progress (spec §40) instead of a
 *  fabricated number. Left null, the assignment just has no progress bar. */
export const interventionAssignment = pgTable(
  "intervention_assignment",
  {
    id: text("id").primaryKey(),
    interventionId: text("intervention_id")
      .notNull()
      .references(() => intervention.id, { onDelete: "cascade" }),
    studentId: text("student_id").notNull(),
    assignedBy: text("assigned_by").notNull(),
    reason: text("reason").notNull(),
    evidence: jsonb("evidence").$type<Record<string, unknown> | null>(),
    priority: priorityEnum("priority").notNull(),
    dueDate: timestamp("due_date", { withTimezone: true }),
    linkedEnrollmentId: text("linked_enrollment_id"),
    status: interventionAssignmentStatusEnum("status").notNull().default("ASSIGNED"),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (t) => [
    index("intervention_assignment_student_status_idx").on(t.studentId, t.status),
    index("intervention_assignment_intervention_idx").on(t.interventionId),
  ]
);

export const INTERVENTION_ASSIGNMENT_TRANSITIONS: Record<string, string[]> = {
  ASSIGNED: ["ACKNOWLEDGED", "CANCELLED", "OVERDUE"],
  ACKNOWLEDGED: ["IN_PROGRESS", "CANCELLED", "OVERDUE"],
  IN_PROGRESS: ["COMPLETED", "CANCELLED", "OVERDUE"],
  OVERDUE: ["IN_PROGRESS", "COMPLETED", "CANCELLED"],
  COMPLETED: [],
  CANCELLED: [],
};
