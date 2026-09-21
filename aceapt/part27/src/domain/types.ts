/**
 * Domain types for ACEAPT Feature 27 — Forecast.
 *
 * These are intentionally storage-agnostic (no ORM/DB decorators) so they can
 * sit in front of whatever the real PrepVista schema turns out to be. Where
 * the master spec proposed new entities (section 58: ReadinessSnapshot,
 * ForecastSnapshot, ForecastFactor, ForecastEvidence, ReadinessTarget,
 * TrajectoryPoint, RiskSignal, ScenarioProjection) we've kept the same names
 * so mapping this onto a real schema later is a rename, not a redesign.
 */

// ---------------------------------------------------------------------------
// Capability model (section 10-13)
// ---------------------------------------------------------------------------

/** The six capability dimensions Feature 27 reasons about. Not a full score —
 * see section 11: "Do not reduce the entire model to one number internally." */
export type CapabilityDimensionKey =
  | "mastery"
  | "retention"
  | "transfer"
  | "accuracy"
  | "speed"
  | "consistency";

export type DimensionLabel = "STRONG" | "MODERATE" | "NEEDS_ATTENTION" | "INSUFFICIENT_DATA";

export interface CapabilityDimensionValue {
  key: CapabilityDimensionKey;
  /** 0-100. Already computed upstream (mastery system, Feature 24 Retention,
   * Feature 25 Transfer, attempt tracking) — Feature 27 aggregates and labels,
   * it does not recompute raw scores. */
  value: number;
  label: DimensionLabel;
  observationCount: number;
  lastUpdated: string; // ISO date
}

export interface CapabilitySnapshot {
  studentId: string;
  dimensions: Partial<Record<CapabilityDimensionKey, CapabilityDimensionValue>>;
  asOf: string; // ISO date
}

// ---------------------------------------------------------------------------
// Target & gap (section 11, 20)
// ---------------------------------------------------------------------------

export interface ReadinessTarget {
  studentId: string;
  targetDimensions: Partial<Record<CapabilityDimensionKey, number>>;
  overallTarget: number; // 0-100
  assessmentDate?: string | null; // ISO date
  assessmentLabel?: string | null;
}

export interface GapItem {
  dimension: CapabilityDimensionKey;
  current: number;
  target: number;
  /** target - current. Positive means behind target, negative means exceeding it. */
  gap: number;
}

// ---------------------------------------------------------------------------
// Trajectory (section 14, 22-26)
// ---------------------------------------------------------------------------

export interface SeriesPoint {
  date: string; // ISO date
  value: number; // 0-100
}

export type TrendType =
  | "IMPROVEMENT"
  | "STABILITY"
  | "STAGNATION"
  | "REGRESSION"
  | "BREAKTHROUGH"
  | "INSUFFICIENT_DATA";

export type MomentumState =
  | "STRONG_POSITIVE"
  | "POSITIVE"
  | "STABLE"
  | "SLOWING"
  | "NEGATIVE"
  | "INSUFFICIENT_DATA";

export interface TrendResult {
  dimension: CapabilityDimensionKey | "overall";
  trend: TrendType;
  momentum: MomentumState;
  /** Rounded to 1 decimal. Null only when there isn't enough data to fit a line. */
  slopePerWeek: number | null;
  observations: number;
  /** Plain-language, generated from the actual numbers — never a static string. */
  explanation: string;
  /** Present only for REGRESSION/STAGNATION. Things to *check*, not asserted
   * causes — see section 24/25: never declare a cause the evidence doesn't support. */
  investigatePrompts?: string[];
}

// ---------------------------------------------------------------------------
// Evidence quality & confidence (section 15, 18)
// ---------------------------------------------------------------------------

export interface EvidenceQualityInput {
  observationCount: number;
  /** Average age (days) of the observations feeding this forecast. Lower = fresher. */
  recencyDaysAvg: number;
  topicDiversity: number; // 0-1
  difficultyDiversity: number; // 0-1
  noveltyRatio: number; // 0-1
  hasTransferEvidence: boolean;
  hasAssessmentEvidence: boolean;
  hasTimedEvidence: boolean;
  /** 0-1, higher = more internally consistent history (less noisy). */
  historicalStability: number;
  breakdown?: {
    assessments: number;
    adaptiveSessions: number;
    practiceQuestions: number;
  };
}

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export interface EvidenceConfidenceResult {
  level: ConfidenceLevel;
  /** Internal 0-1 score. Never surfaced to the student directly — level + reasons are. */
  score: number;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Forecast (section 16-21)
// ---------------------------------------------------------------------------

export interface ForecastRange {
  low: number;
  high: number;
}

export type ReadinessState =
  | "NOT_ENOUGH_EVIDENCE"
  | "DEVELOPING"
  | "AT_RISK"
  | "IMPROVING"
  | "ON_TRACK"
  | "TARGET_REACHED"
  | "STABLE";

export interface ForecastResult {
  studentId: string;
  generatedAt: string; // ISO date
  current: number; // integer 0-100, never fake-precision decimals (section 17)
  target: number;
  projectedRange: ForecastRange;
  status: ReadinessState;
  confidence: EvidenceConfidenceResult;
  mainFactor: CapabilityDimensionKey | null;
  daysRemaining: number | null;
  /** Range of sessions estimated to close the gap. Null unless there's a
   * defensible basis (positive trend + known session cadence) — section 21. */
  estimatedEffortSessions: ForecastRange | null;
}

// ---------------------------------------------------------------------------
// Risk (section 30-32)
// ---------------------------------------------------------------------------

export type RiskFactorType =
  | "TRANSFER_GAP"
  | "RETENTION_DECAY"
  | "SPEED_LIMITATION"
  | "LOW_CONSISTENCY"
  | "PERSISTENT_MISCONCEPTION"
  | "ASSESSMENT_PERFORMANCE_GAP"
  | "INSUFFICIENT_EVIDENCE"
  | "SLOW_TRAJECTORY"
  | "STAGNATION"
  | "DIFFICULTY_INSTABILITY"
  | "NOVELTY_WEAKNESS"
  | "TIME_PRESSURE_WEAKNESS";

export interface RiskSignal {
  type: RiskFactorType;
  dimension?: CapabilityDimensionKey;
  /** Points below target, or another domain-appropriate magnitude. Always the
   * real computed number, never invented. */
  magnitude: number;
  /** Internal ranking score (magnitude weighted by risk-type importance). */
  severity: number;
  /** Generated from the real inputs — see section 31: "every major risk must
   * be explainable from evidence." */
  explanation: string;
}

// ---------------------------------------------------------------------------
// Explainability (section 42, 43, 49)
// ---------------------------------------------------------------------------

export interface ForecastEvidenceItem {
  statement: string;
  supportingObservation: "OBSERVED" | "INFERRED" | "PROJECTED";
}

export interface WhyPanelContent {
  evidence: ForecastEvidenceItem[];
  conclusion: string;
}

// ---------------------------------------------------------------------------
// Scenarios (section 35-37)
// ---------------------------------------------------------------------------

export interface ScenarioAssumptions {
  label: string;
  /** Positive = more focused sessions/week than currently observed, negative = fewer. */
  weeklyFocusedSessionsDelta: number;
  focusDimension?: CapabilityDimensionKey | null;
}

export interface ScenarioResult {
  label: string;
  assumptions: ScenarioAssumptions;
  projectedRange: ForecastRange;
  primaryImprovementArea: CapabilityDimensionKey | null;
  confidence: ConfidenceLevel;
  disclaimer: string;
}

// ---------------------------------------------------------------------------
// Readiness / forecast history (section 40-41, 58)
// ---------------------------------------------------------------------------

export interface ReadinessSnapshot {
  id: string;
  studentId: string;
  date: string; // ISO date
  readiness: number;
  status: ReadinessState;
}

export interface ForecastSnapshotRecord {
  id: string;
  studentId: string;
  generatedAt: string;
  forecast: ForecastResult | null;
  gaps: GapItem[];
  risks: RiskSignal[];
  whyPanel: WhyPanelContent | null;
  status: ReadinessState;
}

export interface TransitionResult {
  changed: boolean;
  explanation: string | null;
}
