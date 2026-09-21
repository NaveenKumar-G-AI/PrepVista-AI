// Core domain types for Feature 44 - Goal-Based Learning Engine.
// These are the canonical shapes every engine/service/route agrees on.

export type GoalType =
  | "PLACEMENT_READINESS"
  | "ASSESSMENT_PREPARATION"
  | "SKILL_IMPROVEMENT"
  | "PERFORMANCE_IMPROVEMENT"
  | "SPEED_IMPROVEMENT"
  | "ACCURACY_IMPROVEMENT"
  | "OVERALL_APTITUDE"
  | "CUSTOM";

export type GoalStatus = "ACTIVE" | "PAUSED" | "COMPLETED" | "ABANDONED";

export type DeadlineType = "EXACT_DATE" | "DAYS_FROM_NOW" | "NONE" | "UNKNOWN";

export type GoalHealth =
  | "HEALTHY"
  | "IMPROVING"
  | "NEEDS_ATTENTION"
  | "AT_RISK"
  | "PAUSED"
  | "COMPLETED";

export type GoalFeasibility =
  | "ON_TRACK"
  | "CHALLENGING"
  | "HIGHLY_CONSTRAINED"
  | "INSUFFICIENT_EVIDENCE"
  | null; // null = no deadline set, feasibility is not applicable (Section 47)

export type GoalConfidence = "LOW" | "MODERATE" | "HIGH";

export type MilestoneStatus = "UPCOMING" | "ACTIVE" | "ACHIEVED";

export type SnapshotTrigger =
  | "CREATED"
  | "RECALCULATED"
  | "MILESTONE_REACHED"
  | "PAUSED"
  | "RESUMED"
  | "MANUAL"
  | "PERFORMANCE_UPDATE";

export type HistoryEventType =
  | "CREATED"
  | "UPDATED"
  | "TARGET_CHANGED"
  | "PRIORITY_CHANGED"
  | "MILESTONE_REACHED"
  | "PAUSED"
  | "RESUMED"
  | "RECALCULATED"
  | "COMPLETED"
  | "ABANDONED";

/** The dimensions Feature 44 knows how to reason about. Only ever
 * populated from dimensions the CapabilityDataClient actually returns -
 * never invented (Section 69). */
export type CapabilityDimension =
  | "quant"
  | "logical"
  | "verbal"
  | "probability"
  | "data_interpretation";

export type SpeedBand = "SLOW" | "DEVELOPING" | "ON_PACE" | "FAST";

/** What the mock (and, in the real system, the real Feature 43 client)
 * returns for a student. Optional fields are optional because Feature 44
 * must never fabricate a number it wasn't given (Sections 18, 69). */
export interface CapabilitySnapshot {
  studentId: string;
  assessedAt: string;
  scores: Partial<Record<CapabilityDimension, number>>;
  accuracy?: number;
  speedBand?: SpeedBand;
  consistency?: number;
  /** Capability points gained per hour of focused practice, per
   * dimension, when there is enough history to estimate it. Absence of
   * a dimension here means "not enough evidence", not "zero". */
  improvementRatePerHour?: Partial<Record<CapabilityDimension, number>>;
}

export type AvailableTime = Partial<
  Record<
    "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday",
    number // minutes
  >
>;

export interface GapSize {
  dimension: CapabilityDimension;
  current: number | null;
  target: number | null;
  gap: number | null; // null when target or current is unknown - never guessed
  classification: "NONE" | "SMALL" | "MODERATE" | "LARGE" | "UNKNOWN";
}

export interface DimensionalGap {
  capability: GapSize[];
  accuracyGap: { current: number | null; target: number | null; gap: number | null } | null;
  speedGap: { current: SpeedBand | null; target: SpeedBand | null; met: boolean | null } | null;
  consistencyGap: { current: number | null; target: number | null; gap: number | null } | null;
  /** Dimensions the spec asks for (Section 20) that the current mock
   * capability client cannot support with real data. Named explicitly
   * instead of silently omitted, so the "why is this missing" question
   * always has an honest answer. */
  unsupported: string[];
}

/** A rankable priority target. Capability dimensions (quant, logical, ...)
 * plus the two cross-cutting axes the spec's own worked example (Section
 * 22) ranks alongside them: overall speed and overall accuracy. */
export type PriorityTarget = CapabilityDimension | "speed" | "accuracy";

export interface PriorityScoreBreakdown {
  target: PriorityTarget;
  goalRelevance: number; // 0-1, from goal type + what the goal explicitly targets
  normalizedGap: number; // 0-1
  assessmentRelevance: number; // 0-1
  learningOpportunity: number; // 0-1, "quick win" potential
  score: number; // weighted sum, 0-1
  /** Plain-language, template-generated (never LLM-generated - Section 21
   * forbids using an LLM for the numeric priority itself) reason a human
   * can read directly, built only from the fields above. */
  reason: string;
}

export interface PriorityResult {
  ranked: PriorityScoreBreakdown[];
  top: PriorityTarget | null;
  /** 0-1. How much the short/long remaining time pushed the ranking
   * toward quick-win dimensions over raw gap size (Section 16). Exposed
   * so explanations can say *why* the ranking leans the way it does. */
  timeUrgency: number;
}

export interface Goal {
  id: string;
  studentId: string;
  goalType: GoalType;
  title: string;
  description: string | null;
  status: GoalStatus;
  isPrimary: boolean;
  priorityOrder: number;
  deadlineType: DeadlineType;
  targetDate: string | null;
  availableTime: AvailableTime;
  targetCapability: Partial<Record<CapabilityDimension, number>>;
  targetAccuracy: number | null;
  targetSpeedBand: SpeedBand | null;
  studentReportedWeakness: string | null;
  currentStateSnapshot: CapabilitySnapshot | Record<string, never>;
  targetStateSnapshot: Record<string, unknown>;
  gapSnapshot: DimensionalGap | Record<string, never>;
  prioritySnapshot: PriorityScoreBreakdown[];
  health: GoalHealth;
  healthReason: string | null;
  feasibility: GoalFeasibility;
  confidence: GoalConfidence;
  progress: number;
  studentMarkedComplete: boolean;
  systemVerifiedComplete: boolean;
  completedAt: string | null;
  pausedAt: string | null;
  resumedAt: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface GoalMilestone {
  id: string;
  goalId: string;
  title: string;
  description: string | null;
  sequence: number;
  status: MilestoneStatus;
  targetState: Record<string, unknown>;
  evidenceRequired: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GoalSnapshotRecord {
  id: string;
  goalId: string;
  capturedAt: string;
  trigger: SnapshotTrigger;
  currentCapability: CapabilitySnapshot;
  targetCapability: Record<string, unknown>;
  gap: DimensionalGap;
  prioritySkills: PriorityScoreBreakdown[];
  health: GoalHealth;
  progress: number;
}
