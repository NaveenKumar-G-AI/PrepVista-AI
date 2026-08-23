import { pgTable, pgEnum, text, timestamp, doublePrecision, jsonb, index } from "drizzle-orm/pg-core";

export const riskLevelEnum = pgEnum("risk_level", ["LOW", "MEDIUM", "HIGH", "CRITICAL", "UNKNOWN"]);

export const readinessMomentumEnum = pgEnum("readiness_momentum", [
  "RISING",
  "STABLE",
  "DECLINING",
  "INSUFFICIENT_DATA",
]);

/**
 * Never mutated or deleted after creation (spec §29) — that's what makes
 * change/momentum/trend calculations trustworthy. `overallScore` and each
 * entry in `categoryScores` are nullable: null means "no data", never 0
 * (spec §57 — missing data must never be interpreted as poor performance).
 */
export const readinessSnapshot = pgTable(
  "readiness_snapshot",
  {
    id: text("id").primaryKey(),
    studentId: text("student_id").notNull(),
    seasonId: text("season_id").notNull(),
    overallScore: doublePrecision("overall_score"), // null = insufficient data
    categoryScores: jsonb("category_scores")
      .$type<Record<string, { score: number; evidenceCount: number } | null>>()
      .notNull(),
    riskLevel: riskLevelEnum("risk_level").notNull(),
    momentum: readinessMomentumEnum("momentum").notNull(),
    calculatedAt: timestamp("calculated_at", { withTimezone: true }).notNull().defaultNow(),
    calculationVersion: text("calculation_version").notNull(),
    sourceSummary: jsonb("source_summary").$type<Record<string, unknown>>().notNull(),
  },
  (t) => [index("readiness_snapshot_student_calculated_idx").on(t.studentId, t.calculatedAt)]
);
