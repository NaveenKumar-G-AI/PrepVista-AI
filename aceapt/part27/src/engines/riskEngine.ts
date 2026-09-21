import type {
  CapabilityDimensionKey,
  EvidenceConfidenceResult,
  ForecastRange,
  GapItem,
  RiskFactorType,
  RiskSignal,
  TrendResult,
} from "../domain/types.js";
import { DIMENSION_DISPLAY_NAMES } from "../domain/constants.js";
import { formatRange, round } from "../utils/format.js";
import type { FailureBoundaryResult, PracticeAssessmentGapResult } from "./practiceAssessmentGapEngine.js";

const SIGNIFICANT_GAP_THRESHOLD = 5;

/** Not every risk type is equally diagnostic. These weights are a tunable
 * product decision — the spec's own narrative (sections 13, 27, 28) leans
 * hard on "knowledge is fine, application under pressure is the problem",
 * so those signals are weighted slightly higher by default. */
const RISK_TYPE_WEIGHT: Record<RiskFactorType, number> = {
  TRANSFER_GAP: 1.15,
  RETENTION_DECAY: 1.0,
  SPEED_LIMITATION: 1.0,
  LOW_CONSISTENCY: 0.95,
  PERSISTENT_MISCONCEPTION: 1.1,
  ASSESSMENT_PERFORMANCE_GAP: 1.15,
  INSUFFICIENT_EVIDENCE: 0.9,
  SLOW_TRAJECTORY: 1.05,
  STAGNATION: 1.1,
  DIFFICULTY_INSTABILITY: 1.0,
  NOVELTY_WEAKNESS: 1.05,
  TIME_PRESSURE_WEAKNESS: 1.2,
};

const GAP_TO_RISK_TYPE: Partial<Record<CapabilityDimensionKey, RiskFactorType>> = {
  transfer: "TRANSFER_GAP",
  retention: "RETENTION_DECAY",
  speed: "SPEED_LIMITATION",
  consistency: "LOW_CONSISTENCY",
};

export interface IdentifyRisksInput {
  gaps: GapItem[];
  overallTrend: TrendResult;
  dimensionTrends: TrendResult[];
  confidence: EvidenceConfidenceResult;
  practiceAssessmentGap: PracticeAssessmentGapResult | null;
  failureBoundary: FailureBoundaryResult | null;
  currentOverall: number | null;
  targetOverall: number | null;
  forecastRange: ForecastRange | null;
  topN?: number;
}

export function identifyRisks(input: IdentifyRisksInput): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const gap of input.gaps) {
    if (gap.gap < SIGNIFICANT_GAP_THRESHOLD) continue;
    const type = GAP_TO_RISK_TYPE[gap.dimension];
    if (!type) continue;
    signals.push({
      type,
      dimension: gap.dimension,
      magnitude: gap.gap,
      severity: gap.gap * RISK_TYPE_WEIGHT[type],
      explanation: `${DIMENSION_DISPLAY_NAMES[gap.dimension]} is ${gap.gap} points below target.`,
    });
  }

  const overallGap =
    input.currentOverall != null && input.targetOverall != null
      ? Math.max(0, round(input.targetOverall - input.currentOverall))
      : 0;

  if (input.overallTrend.trend === "STAGNATION") {
    signals.push({
      type: "STAGNATION",
      magnitude: overallGap,
      severity: Math.max(overallGap, 4) * RISK_TYPE_WEIGHT.STAGNATION,
      explanation: input.overallTrend.explanation,
    });
  }

  if (
    input.overallTrend.trend === "IMPROVEMENT" &&
    input.forecastRange &&
    input.targetOverall != null &&
    input.forecastRange.high < input.targetOverall
  ) {
    const shortfall = round(input.targetOverall - input.forecastRange.high);
    signals.push({
      type: "SLOW_TRAJECTORY",
      magnitude: shortfall,
      severity: shortfall * RISK_TYPE_WEIGHT.SLOW_TRAJECTORY,
      explanation: `Improvement is happening, but the projected range (${formatRange(input.forecastRange)}) may still fall short of the ${round(input.targetOverall)}% target at the current pace.`,
    });
  }

  if (input.confidence.level === "INSUFFICIENT" || input.confidence.level === "LOW") {
    signals.push({
      type: "INSUFFICIENT_EVIDENCE",
      magnitude: 0,
      severity: 4 * RISK_TYPE_WEIGHT.INSUFFICIENT_EVIDENCE * (input.confidence.level === "INSUFFICIENT" ? 1.3 : 1),
      explanation: input.confidence.reasons[0] ?? "Limited evidence is available for a confident forecast.",
    });
  }

  if (input.practiceAssessmentGap?.hasSignificantGap) {
    signals.push({
      type: "ASSESSMENT_PERFORMANCE_GAP",
      magnitude: input.practiceAssessmentGap.gap,
      severity: input.practiceAssessmentGap.gap * RISK_TYPE_WEIGHT.ASSESSMENT_PERFORMANCE_GAP,
      explanation: input.practiceAssessmentGap.explanation,
    });
  }

  if (
    input.failureBoundary &&
    input.failureBoundary.classification !== "STABLE" &&
    input.failureBoundary.classification !== "INSUFFICIENT_DATA"
  ) {
    const type: RiskFactorType =
      input.failureBoundary.classification === "NOVELTY"
        ? "NOVELTY_WEAKNESS"
        : input.failureBoundary.classification === "TIME_PRESSURE"
          ? "TIME_PRESSURE_WEAKNESS"
          : "DIFFICULTY_INSTABILITY";
    const drop = input.failureBoundary.weakestDrop?.drop ?? 0;
    signals.push({
      type,
      magnitude: drop,
      severity: drop * RISK_TYPE_WEIGHT[type],
      explanation: input.failureBoundary.explanation,
    });
  }

  for (const dt of input.dimensionTrends) {
    if (dt.dimension === "retention" && dt.trend === "REGRESSION") {
      const magnitude = Math.abs(dt.slopePerWeek ?? 3);
      signals.push({
        type: "RETENTION_DECAY",
        dimension: "retention",
        magnitude: round(magnitude),
        severity: magnitude * RISK_TYPE_WEIGHT.RETENTION_DECAY,
        explanation: dt.explanation,
      });
    }
  }

  signals.sort((a, b) => b.severity - a.severity);
  return signals.slice(0, input.topN ?? 6);
}

/** Section 32: not every gap matters equally — which one is the highest-
 * impact bottleneck to send to Feature 26? Prefer the top-ranked risk's
 * dimension (it already accounts for both size and diagnostic weight); fall
 * back to the largest raw gap if no risk carries a dimension. */
export function determineMainFactor(risks: RiskSignal[], gaps: GapItem[]): CapabilityDimensionKey | null {
  const topWithDimension = risks.find((r) => r.dimension != null);
  if (topWithDimension?.dimension) return topWithDimension.dimension;
  const sortedGaps = [...gaps].sort((a, b) => b.gap - a.gap);
  const top = sortedGaps[0];
  return top && top.gap > 0 ? top.dimension : null;
}
