/**
 * CodeForge AI — Technical Growth Tracking
 * Core domain types.
 *
 * This module owns longitudinal growth history, evidence aggregation, and
 * growth interpretation. It does NOT own correctness/complexity/quality/
 * reasoning/debugging/review analysis — those are treated as authoritative
 * upstream systems this module consumes through the adapters in
 * `evidence/adapters.ts`. See README.md for the integration contract.
 */

// ---------------------------------------------------------------------------
// Dimensions
// ---------------------------------------------------------------------------

/** Known growth dimensions. Role-specific skills extend this via a plain
 * string key (e.g. "role:backend:api_reasoning") so the enum never has to
 * be edited just to add a role skill. */
export const CORE_DIMENSIONS = [
  "problem_solving",
  "algorithmic_thinking",
  "data_structures",
  "correctness",
  "complexity_understanding",
  "code_quality",
  "reasoning",
  "code_reasoning_consistency",
  "understanding",
  "debugging",
  "technical_communication",
  "code_review_ability",
  "transfer",
  "retention",
  "independent_problem_solving",
  "engineering_robustness",
] as const;

export type CoreDimension = (typeof CORE_DIMENSIONS)[number];

/** A dimension is a core dimension or a role-namespaced skill key. */
export type GrowthDimension = CoreDimension | `role:${string}`;

// ---------------------------------------------------------------------------
// Growth state machine
// ---------------------------------------------------------------------------

export const GROWTH_STATES = [
  "NO_EVIDENCE",
  "INSUFFICIENT_EVIDENCE",
  "EMERGING",
  "IMPROVING",
  "STABLE",
  "STRONG",
  "MASTERED",
  "STAGNATING",
  "AT_RISK",
  "REGRESSING",
  "RECOVERING",
] as const;

export type GrowthState = (typeof GROWTH_STATES)[number];

export const CONFIDENCE_LEVELS = ["INSUFFICIENT", "LOW", "MEDIUM", "HIGH"] as const;
export type ConfidenceLevel = (typeof CONFIDENCE_LEVELS)[number];

export type TrendDirection = "POSITIVE" | "NEGATIVE" | "FLAT" | "UNKNOWN";

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/** Where a piece of evidence originated. Each of these is an EXISTING
 * CodeForge system this module reads from — it must never recompute them. */
export const EVIDENCE_SOURCE_TYPES = [
  "submission",
  "execution",
  "correctness",
  "complexity",
  "code_quality",
  "reasoning",
  "consistency",
  "understanding",
  "debugging",
  "code_review",
  "challenge_outcome",
  "transfer_challenge",
  "retention_challenge",
  "assessment",
  "adaptive_path_outcome",
  "role_assessment",
] as const;

export type EvidenceSourceType = (typeof EVIDENCE_SOURCE_TYPES)[number];

export const ASSISTANCE_LEVELS = ["NONE", "LOW", "MODERATE", "HIGH", "SOLUTION_EXPOSED"] as const;
export type AssistanceLevel = (typeof ASSISTANCE_LEVELS)[number];

export const DIFFICULTY_LEVELS = ["INTRO", "EASY", "MEDIUM", "HARD", "ADVANCED"] as const;
export type DifficultyLevel = (typeof DIFFICULTY_LEVELS)[number];

export type EvidenceOutcome = "SUCCESS" | "PARTIAL" | "FAILURE";

/**
 * A single normalized, immutable, append-only unit of growth evidence.
 * This is the atomic fact the entire system is built on. Every growth
 * conclusion must be traceable back to a set of these.
 */
export interface GrowthEvidence {
  evidenceId: string;
  studentId: string;
  dimension: GrowthDimension;

  sourceType: EvidenceSourceType;
  /** Primary key of the row in the authoritative source system
   * (e.g. the submission id, the debugging_session id). Never duplicated,
   * only referenced. */
  sourceId: string;

  outcome: EvidenceOutcome;
  /** Raw confidence the SOURCE system attached to this result (0-1),
   * distinct from the growth-engine's own aggregated confidence. */
  sourceConfidence: number;

  assistanceLevel: AssistanceLevel;
  difficulty: DifficultyLevel | null;

  isTransfer: boolean;
  isRetentionCheck: boolean;
  /** Groups near-duplicate problems for evidence-diversity scoring
   * (e.g. "two-pointer-array-basic"). Required so that 5 near-identical
   * problems don't count as 5 diverse demonstrations. */
  challengeFamily: string | null;

  roleContext: string | null;

  /** When the underlying activity actually happened (not when this row
   * was written — see `recordedAt`). Growth ordering uses this field. */
  occurredAt: string; // ISO-8601
  /** When this evidence row was written to storage. Used for
   * out-of-order / late-arriving evidence handling. */
  recordedAt: string; // ISO-8601

  /** Schema version of the normalizer that produced this row, so that
   * historical evidence remains interpretable if normalization rules
   * change. */
  evidenceVersion: string;

  /** Small, non-identifying context for evidence drill-down UI, e.g.
   * `{ challengeTitle, language }`. Never raw source code. */
  context: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Time windows
// ---------------------------------------------------------------------------

export const TIME_WINDOW_PRESETS = [
  "RECENT_7D",
  "RECENT_30D",
  "RECENT_90D",
  "SEMESTER",
  "ACADEMIC_YEAR",
  "ALL_TIME",
] as const;

export type TimeWindowPreset = (typeof TIME_WINDOW_PRESETS)[number];

export interface TimeWindow {
  preset: TimeWindowPreset | "CUSTOM";
  startsAt: string | null; // ISO-8601, null = unbounded (ALL_TIME)
  endsAt: string; // ISO-8601, usually "now"
}

// ---------------------------------------------------------------------------
// Confidence
// ---------------------------------------------------------------------------

export interface ConfidenceFactors {
  evidenceCount: number;
  distinctChallengeFamilies: number;
  recencyDays: number;
  consistency: number; // 0-1, higher = less variance across outcomes
  hasTransferEvidence: boolean;
  meanSourceConfidence: number; // 0-1
}

export interface ConfidenceResult {
  level: ConfidenceLevel;
  score: number; // 0-1, internal — never shown with false precision in UI
  factors: ConfidenceFactors;
}

// ---------------------------------------------------------------------------
// Dimension growth result (one dimension, one point in time)
// ---------------------------------------------------------------------------

export interface DimensionGrowth {
  dimension: GrowthDimension;
  state: GrowthState;
  trend: TrendDirection;
  confidence: ConfidenceResult;

  baselineState: GrowthState | null;
  evidenceWindow: TimeWindow;
  evidenceCount: number;

  transferEvidenceCount: number;
  retentionEvidenceCount: number;
  independenceTrend: TrendDirection;

  /** Evidence ids that most directly support this conclusion — always
   * populated so the UI can offer drill-down. Capped, not exhaustive. */
  supportingEvidenceIds: string[];

  /** Set only when state is one of the "movement" states
   * (IMPROVING/REGRESSING/STAGNATING/RECOVERING) and evidence clears the
   * significance threshold — see engine/stateDetection.ts. */
  velocity: "SLOW" | "MODERATE" | "FAST" | null;
}

// ---------------------------------------------------------------------------
// Milestones
// ---------------------------------------------------------------------------

export const MILESTONE_TYPES = [
  "FIRST_INDEPENDENT_SUCCESS",
  "FIRST_TRANSFER_SUCCESS",
  "FIRST_ADVANCED_SUCCESS",
  "FIRST_DEBUGGING_RECOVERY",
  "COMPLEXITY_IMPROVEMENT",
  "CONSISTENT_CORRECTNESS",
  "SUCCESSFUL_REVIEW_RESPONSE",
  "ROLE_SKILL_MILESTONE",
  "RETENTION_CONFIRMED",
] as const;

export type MilestoneType = (typeof MILESTONE_TYPES)[number];

export interface GrowthMilestone {
  /** Deterministic identity key used for deduplication:
   * `${studentId}:${dimension}:${milestoneType}:${sourceEvidenceId}` */
  milestoneKey: string;
  milestoneId: string;
  studentId: string;
  dimension: GrowthDimension;
  milestoneType: MilestoneType;
  sourceEvidenceId: string;
  occurredAt: string;
  rulesVersion: string;
}

// ---------------------------------------------------------------------------
// Insights (deterministic — never AI-invented, see engine/insights.ts)
// ---------------------------------------------------------------------------

export const INSIGHT_TYPES = [
  "IMPROVEMENT",
  "REGRESSION",
  "STAGNATION",
  "RECOVERY",
  "TRANSFER_GAIN",
  "RETENTION",
  "INDEPENDENCE_GAIN",
  "MILESTONE",
  "DEVELOPMENT_AREA",
] as const;

export type InsightType = (typeof INSIGHT_TYPES)[number];

/**
 * Structured, evidence-grounded insight. `claim` is a template-filled
 * string built entirely from fields already on this object — never freeform
 * model output. An LLM may OPTIONALLY be used downstream purely to restyle
 * `claim` in a friendlier voice (see lib/growth/explain.ts), but the claim,
 * evidenceRefs, confidence, and recommendedAction are computed here and are
 * the source of truth the restyled text must not contradict.
 */
export interface GrowthInsight {
  insightId: string;
  studentId: string;
  insightType: InsightType;
  dimension: GrowthDimension;
  claim: string;
  evidenceRefs: string[];
  confidence: ConfidenceLevel;
  recommendedAction: RecommendedAction | null;
  generatedAt: string;
  rulesVersion: string;
  /** True if this insight was generated under assessment-mode constraints
   * and must not be shown outside assessment context (or vice versa) —
   * enforced again at the API layer, this is defense in depth. */
  assessmentSafe: boolean;
}

/** Growth tracking never picks the next challenge itself — it only hands a
 * structured signal to the existing adaptive engine. This is that signal. */
export interface RecommendedAction {
  kind: "ADAPTIVE_CHALLENGE" | "DEBUGGING_PRACTICE" | "REVIEW_PRACTICE" | "TRANSFER_CHALLENGE" | "RETENTION_CHECK";
  dimension: GrowthDimension;
  reason: InsightType;
}

// ---------------------------------------------------------------------------
// Snapshots (immutable, versioned)
// ---------------------------------------------------------------------------

export interface GrowthSnapshot {
  snapshotId: string;
  studentId: string;
  roleContext: string | null;

  dimensions: DimensionGrowth[];
  overallState: GrowthState;
  overallConfidence: ConfidenceLevel;

  activityLevel: "LOW" | "MODERATE" | "HIGH";
  /** Explicitly separate from growth per spec: high activity + flat
   * evidence must never be silently read as growth. */

  evidenceWindow: TimeWindow;
  generatedAt: string;

  studentModelVersion: string;
  skillModelVersion: string;
  growthEngineVersion: string;
  rulesVersion: string;
}

// ---------------------------------------------------------------------------
// Roles (consumed, never recomputed here)
// ---------------------------------------------------------------------------

export interface RoleGrowthProfile {
  roleId: string;
  /** Dimensions this role treats as primary signals for readiness.
   * Sourced from the existing role-skill model — this module only reads
   * this list, it never decides which dimensions matter for a role. */
  primaryDimensions: GrowthDimension[];
}
