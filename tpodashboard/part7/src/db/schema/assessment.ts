import {
  pgTable,
  pgEnum,
  text,
  timestamp,
  integer,
  doublePrecision,
  boolean,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";

// ---- Assessment family + version (spec §19, §20 — never mutate a live version) --

export const assessment = pgTable(
  "assessment",
  {
    id: text("id").primaryKey(),
    institutionId: text("institution_id").notNull(),
    name: text("name").notNull(),
    categoryId: text("category_id").notNull(), // -> taxonomy_term
    skillIds: text("skill_ids").array().notNull().default([]),
    createdBy: text("created_by").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("assessment_institution_idx").on(t.institutionId)]
);

export const assessmentVersionStatusEnum = pgEnum("assessment_version_status", [
  "DRAFT",
  "PUBLISHED",
  "RETIRED",
]);

export const assessmentVersion = pgTable(
  "assessment_version",
  {
    id: text("id").primaryKey(),
    assessmentId: text("assessment_id")
      .notNull()
      .references(() => assessment.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    durationMins: integer("duration_mins").notNull(),
    maxScore: doublePrecision("max_score").notNull(),
    passingScore: doublePrecision("passing_score"),
    status: assessmentVersionStatusEnum("status").notNull().default("DRAFT"),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("assessment_version_assessment_version_unique").on(t.assessmentId, t.version)]
);

// ---- Questions (spec §21) --------------------------------------------------

export const questionTypeEnum = pgEnum("question_type", [
  "MCQ",
  "MULTI_SELECT",
  "CODING",
  "TEXT",
  "RATING",
  "PRACTICAL",
  "CUSTOM",
]);

export const assessmentQuestion = pgTable(
  "assessment_question",
  {
    id: text("id").primaryKey(),
    assessmentVersionId: text("assessment_version_id")
      .notNull()
      .references(() => assessmentVersion.id, { onDelete: "cascade" }),
    type: questionTypeEnum("type").notNull(),
    prompt: text("prompt").notNull(),
    options: jsonb("options").$type<unknown>(),
    correctAnswer: jsonb("correct_answer").$type<unknown>(),
    skillId: text("skill_id"),
    maxScore: doublePrecision("max_score").notNull(),
    order: integer("order").notNull(),
  },
  (t) => [index("assessment_question_version_idx").on(t.assessmentVersionId)]
);

// ---- Attempts + Results (spec §22, §23) ------------------------------------

export const attemptStatusEnum = pgEnum("attempt_status", [
  "NOT_STARTED",
  "IN_PROGRESS",
  "COMPLETED",
  "ABANDONED",
  "INVALIDATED",
]);

export const attemptSourceEnum = pgEnum("attempt_source", ["WEB", "TPO_ENTRY", "IMPORT"]);

export const assessmentAttempt = pgTable(
  "assessment_attempt",
  {
    id: text("id").primaryKey(),
    assessmentVersionId: text("assessment_version_id")
      .notNull()
      .references(() => assessmentVersion.id),
    studentId: text("student_id").notNull(),
    attemptNumber: integer("attempt_number").notNull(),
    status: attemptStatusEnum("status").notNull().default("NOT_STARTED"),
    source: attemptSourceEnum("source").notNull().default("WEB"),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    needsReview: boolean("needs_review").notNull().default(false),
    reviewReason: text("review_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("assessment_attempt_version_student_attempt_unique").on(
      t.assessmentVersionId,
      t.studentId,
      t.attemptNumber
    ),
    index("assessment_attempt_student_idx").on(t.studentId),
  ]
);

/** Immutable once written (spec §23) — a re-grade is a new row, not a mutation. */
export const assessmentResult = pgTable("assessment_result", {
  id: text("id").primaryKey(),
  attemptId: text("attempt_id")
    .notNull()
    .unique()
    .references(() => assessmentAttempt.id, { onDelete: "cascade" }),
  totalScore: doublePrecision("total_score").notNull(),
  normalizedScore: doublePrecision("normalized_score").notNull(),
  skillBreakdown: jsonb("skill_breakdown").$type<Record<string, number>>().notNull(),
  evaluationSource: text("evaluation_source").notNull(), // AUTO_GRADED | TPO_GRADED | IMPORTED
  evaluatedAt: timestamp("evaluated_at", { withTimezone: true }).notNull().defaultNow(),
});
