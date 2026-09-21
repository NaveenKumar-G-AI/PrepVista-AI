/**
 * Mirrors the shapes returned by the Feature 27 API (src/domain/types.ts).
 * Kept self-contained (no import from ../src) so this frontend/ folder can be
 * copied into an existing PrepVista frontend app without dragging the
 * backend package along.
 */

export type CapabilityDimensionKey = "mastery" | "retention" | "transfer" | "accuracy" | "speed" | "consistency";

export type DimensionLabel = "STRONG" | "MODERATE" | "NEEDS_ATTENTION" | "INSUFFICIENT_DATA";

export interface CapabilityDimensionValue {
  key: CapabilityDimensionKey;
  value: number;
  label: DimensionLabel;
  observationCount: number;
  lastUpdated: string;
}

export interface CapabilitySnapshot {
  studentId: string;
  dimensions: Partial<Record<CapabilityDimensionKey, CapabilityDimensionValue>>;
  asOf: string;
}

export type ReadinessState =
  | "NOT_ENOUGH_EVIDENCE"
  | "DEVELOPING"
  | "AT_RISK"
  | "IMPROVING"
  | "ON_TRACK"
  | "TARGET_REACHED"
  | "STABLE";

export type ConfidenceLevel = "HIGH" | "MEDIUM" | "LOW" | "INSUFFICIENT";

export interface ForecastRange {
  low: number;
  high: number;
}

export interface ForecastResult {
  studentId: string;
  generatedAt: string;
  current: number;
  target: number;
  projectedRange: ForecastRange;
  status: ReadinessState;
  confidence: { level: ConfidenceLevel; score: number; reasons: string[] };
  mainFactor: CapabilityDimensionKey | null;
  daysRemaining: number | null;
  estimatedEffortSessions: ForecastRange | null;
}

export type TrendType = "IMPROVEMENT" | "STABILITY" | "STAGNATION" | "REGRESSION" | "BREAKTHROUGH" | "INSUFFICIENT_DATA";
export type MomentumState = "STRONG_POSITIVE" | "POSITIVE" | "STABLE" | "SLOWING" | "NEGATIVE" | "INSUFFICIENT_DATA";

export interface TrendResult {
  dimension: CapabilityDimensionKey | "overall";
  trend: TrendType;
  momentum: MomentumState;
  slopePerWeek: number | null;
  observations: number;
  explanation: string;
  investigatePrompts?: string[];
}

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
  magnitude: number;
  severity: number;
  explanation: string;
}

export const RISK_TYPE_LABELS: Record<RiskFactorType, string> = {
  TRANSFER_GAP: "Transfer gap",
  RETENTION_DECAY: "Retention decay",
  SPEED_LIMITATION: "Speed limitation",
  LOW_CONSISTENCY: "Low consistency",
  PERSISTENT_MISCONCEPTION: "Persistent misconception",
  ASSESSMENT_PERFORMANCE_GAP: "Practice vs. assessment gap",
  INSUFFICIENT_EVIDENCE: "Insufficient evidence",
  SLOW_TRAJECTORY: "Slow trajectory",
  STAGNATION: "Stagnation",
  DIFFICULTY_INSTABILITY: "Difficulty instability",
  NOVELTY_WEAKNESS: "Novelty weakness",
  TIME_PRESSURE_WEAKNESS: "Time-pressure weakness",
};

export interface ForecastEvidenceItem {
  statement: string;
  supportingObservation: "OBSERVED" | "INFERRED" | "PROJECTED";
}

export interface WhyPanelContent {
  evidence: ForecastEvidenceItem[];
  conclusion: string;
}

export interface ScenarioResult {
  label: string;
  projectedRange: ForecastRange;
  primaryImprovementArea: CapabilityDimensionKey | null;
  confidence: ConfidenceLevel;
  disclaimer: string;
}

export interface InterventionStep {
  title: string;
  minutes: number;
}

export interface InterventionPlan {
  planId: string;
  studentId: string;
  createdAt: string;
  focusDimension: CapabilityDimensionKey | null;
  steps: InterventionStep[];
  totalMinutes: number;
}

export interface ReadinessSummary {
  studentId: string;
  currentOverall: number;
  status: ReadinessState;
  capability: CapabilitySnapshot;
  transition: { changed: boolean; explanation: string | null };
}

/** Everything the <ForecastScreen> composition needs. In your app this is
 * typically assembled from 2-3 API calls (readiness + forecast + risks) —
 * see useForecastApi.ts for one way to fetch it. */
export interface ForecastScreenData {
  readiness: ReadinessSummary;
  forecast: ForecastResult | null;
  overallTrend: TrendResult;
  risks: RiskSignal[];
  mainFactor: CapabilityDimensionKey | null;
  whyPanel: WhyPanelContent | null;
  whyNarrative: string | null;
  roadmap: string[];
  trajectoryHistory?: { date: string; value: number }[]; // for the detailed chart; optional
}
