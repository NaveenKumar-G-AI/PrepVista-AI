import type { MasteryEvidence } from "../types/index.js";
import { recencyWeightedMean, linearSlope, daysBetween } from "../utils/stats.js";
import { getMasteryModelConfig } from "../config/masteryModel.js";

export interface RetentionAssessment {
  retentionScore: number | null;
  trendSlopePerDay: number | null;
  delayedEvidenceCount: number;
  /** True when there's a real, meaningful decline pattern - not just "time passed". */
  retentionRiskDetected: boolean;
}

/**
 * Spec section 9/23: a high score today doesn't prove the skill will still
 * be there next week, and time passing alone is never treated as evidence
 * of forgetting - only DELAYED-type evidence (attempts genuinely spaced out
 * after the skill was last worked on) counts here. A gentle decline that
 * stays well above threshold (e.g. 92 -> 88 -> 86 -> 84 over 30 days, the
 * spec's own example) reads as retained; a steep slope combined with a
 * level drop reads as at-risk. The two are deliberately different signals:
 * retentionScore feeds the mastery dimension, retentionRiskDetected feeds
 * an early, softer warning distinct from the harder AT_RISK/REGRESSED
 * mastery-state transition in regressionDetectionService.ts.
 */
export function assessRetention(evidence: MasteryEvidence[]): RetentionAssessment {
  const config = getMasteryModelConfig();
  const delayed = evidence
    .filter((e) => e.evidenceType === "DELAYED" && e.questionExposureState !== "MEMORIZATION_RISK")
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  if (delayed.length === 0) {
    return { retentionScore: null, trendSlopePerDay: null, delayedEvidenceCount: 0, retentionRiskDetected: false };
  }

  const scores = delayed.map((e) => e.score);
  const retentionScore = recencyWeightedMean(scores, config.recency.halfLife);

  let trendSlopePerDay: number | null = null;
  let retentionRiskDetected = false;

  if (delayed.length >= config.retention.minDelayedPointsForTrend) {
    const t0 = new Date(delayed[0].createdAt);
    const xValues = delayed.map((e) => daysBetween(t0, new Date(e.createdAt)));
    trendSlopePerDay = linearSlope(xValues, scores);

    const latest = scores[scores.length - 1];
    const peak = Math.max(...scores);
    const meaningfulLevelDrop = peak - latest >= 0.10;
    retentionRiskDetected = trendSlopePerDay <= config.retention.riskSlopePerDay && meaningfulLevelDrop;
  }

  return { retentionScore, trendSlopePerDay, delayedEvidenceCount: delayed.length, retentionRiskDetected };
}
