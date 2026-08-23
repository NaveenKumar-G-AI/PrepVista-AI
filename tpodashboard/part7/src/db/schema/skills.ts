import { pgTable, pgEnum, text, timestamp, doublePrecision, index } from "drizzle-orm/pg-core";

export const evidenceTypeEnum = pgEnum("evidence_type", [
  "ASSESSMENT",
  "MOCK_INTERVIEW",
  "TRAINING_EVALUATION",
  "TPO_EVALUATION",
  "STUDENT_EVIDENCE",
  "PLACEMENT_INTERVIEW",
]);

/** Every score traces to a source — spec §28: "avoid unexplained scores". */
export const skillMeasurement = pgTable(
  "skill_measurement",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    skillId: text("skill_id").notNull(),
    score: doublePrecision("score").notNull(),
    evidenceType: evidenceTypeEnum("evidence_type").notNull(),
    evidenceRefId: text("evidence_ref_id"),
    evidenceRefType: text("evidence_ref_type"),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull().defaultNow(),
    notes: text("notes"),
  },
  (t) => [index("skill_measurement_student_skill_idx").on(t.studentId, t.skillId, t.measuredAt)]
);
