/**
 * Core domain types for Technical Growth Tracking.
 *
 * These types describe the INPUT the growth engine consumes (skill
 * observations built from evidence that the authoritative Skill
 * Signal / Mastery system already produced) and the OUTPUT it derives
 * (growth measurements, trends, regressions, milestones).
 *
 * The engine never invents a skill value itself — `SkillObservation.value`
 * is assumed to already come from the existing skill/mastery model. This
 * module only reasons about how that value changes over time, with what
 * confidence, and why.
 */

export type Confidence = "INSUFFICIENT" | "LOW" | "MODERATE" | "HIGH";

export type EvidenceType =
  | "CHALLENGE_SUBMISSION"
  | "ADAPTIVE_CHALLENGE"
  | "ASSESSMENT"
  | "DIAGNOSTIC"
  | "DEBUGGING_TASK"
  | "UNDERSTANDING_CHECK";

export type DifficultyLevel = "BEGINNER" | "INTERMEDIATE" | "ADVANCED" | "EXPERT";

/** Which capability dimension a piece of evidence speaks to, used for regression typing. */
export type EvidenceDimension =
  | "PERFORMANCE"
  | "RETENTION"
  | "TRANSFER"
  | "UNDERSTANDING"
  | "ROLE_SKILL";

/**
 * A single piece of validated technical evidence. This is a thin reference —
 * the growth engine does not re-derive correctness/quality/reasoning scores,
 * it consumes them as already-validated facts from upstream systems
 * (submission grading, assessment scoring, code quality analysis, etc).
 */
export interface EvidenceRef {
  id: string;
  type: EvidenceType;
  skillId: string;
  observedAt: string; // ISO-8601
  difficulty?: DifficultyLevel;
  isTransfer?: boolean;
  /** Used for milestone diversity checks (e.g. debugging across distinct problem families). */
  problemFamily?: string;
  dimension?: EvidenceDimension;
  /** True if the evidence demonstrates correct complexity reasoning, not just a passing result. */
  demonstratesComplexityReasoning?: boolean;
  /**
   * Whether this submission actually succeeded (passed / correct fix / correct
   * transfer), as opposed to merely being attempted. Undefined is treated as
   * success for callers that don't track pass/fail explicitly — but any
   * caller that DOES know the outcome (like the real evidence pipeline)
   * should always set this, because milestones like DEBUGGING_MILESTONE and
   * FIRST_TRANSFER_SUCCESS are only meaningful for evidence that succeeded.
   */
  successful?: boolean;
}

/**
 * A point-in-time read of a student's capability in one skill, as the
 * authoritative skill/mastery system understood it, plus the evidence that
 * supports it. This is the unit the growth engine compares across time.
 */
export interface SkillObservation {
  skillId: string;
  skillName?: string;
  /** 0-100, already normalized by the upstream skill/mastery model. */
  value: number;
  observedAt: string;
  evidence: EvidenceRef[];
  calculationVersion: string;
  assessmentType?: string;
  sourceType: "DIAGNOSTIC" | "ASSESSMENT" | "AGGREGATED_SIGNAL";
  /** 0-1, how relevant this skill is to the student's target role, if known. */
  roleRelevance?: number;
}

export interface ComparabilityResult {
  comparable: boolean;
  reasons: string[];
}

export interface GrowthMeasurement {
  unavailable?: false;
  skillId: string;
  baselineValue: number;
  currentValue: number;
  absoluteChange: number;
  relativeChange: number | null;
  confidence: Confidence;
  evidenceCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
}

export interface GrowthUnavailable {
  unavailable: true;
  skillId: string;
  reasons: string[];
}

export type GrowthResult = GrowthMeasurement | GrowthUnavailable;

export function isGrowthAvailable(g: GrowthResult): g is GrowthMeasurement {
  return !g.unavailable;
}
