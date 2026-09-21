/**
 * Bottleneck detection (§75-76, §104, §159, §204-206). Turns already-computed
 * aggregate stats into a short list of likely bottlenecks, each tagged with
 * an InsightConfidence — never presented as settled fact, and never computed
 * at all below the minimum sample size (§205).
 *
 * Thresholds are illustrative defaults, not validated constants — see
 * DEFAULT_BOTTLENECK_THRESHOLDS. Tune them once real usage data exists.
 */
import type { Bottleneck, DecisionAggregateStats, InsightConfidence } from '../types';
import { MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT } from './calibration';

export const DEFAULT_BOTTLENECK_THRESHOLDS = {
  timeOverrunRate: 0.35,
  blindGuessRate: 0.4,
  potentiallyUnnecessarySkipRate: 0.3,
  weakEliminationRate: 0.25, // eliminationRate BELOW this, among uncertain decisions, is the flag
  unsupportedSwitchRate: 0.5,
};

export interface BottleneckFinding {
  bottleneck: Bottleneck;
  confidence: InsightConfidence;
}

export function detectBottlenecks(
  stats: DecisionAggregateStats,
  sampleSize: number,
  thresholds = DEFAULT_BOTTLENECK_THRESHOLDS
): BottleneckFinding[] {
  if (sampleSize < MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT) return [];

  const confidence: InsightConfidence = sampleSize >= 30 ? 'HIGH' : 'MEDIUM';
  const findings: BottleneckFinding[] = [];

  if (stats.timeOverrunRate > thresholds.timeOverrunRate) {
    findings.push({ bottleneck: 'TOO_MUCH_TIME', confidence });
  }
  if (stats.blindGuessRate > thresholds.blindGuessRate) {
    findings.push({ bottleneck: 'TOO_MUCH_GUESSING', confidence });
  }
  if (stats.potentiallyUnnecessarySkipRate > thresholds.potentiallyUnnecessarySkipRate) {
    findings.push({ bottleneck: 'TOO_MUCH_SKIPPING', confidence });
  }
  if (stats.eliminationRate < thresholds.weakEliminationRate) {
    findings.push({ bottleneck: 'WEAK_ELIMINATION', confidence });
  }
  if (stats.unsupportedSwitchRate > thresholds.unsupportedSwitchRate) {
    findings.push({ bottleneck: 'UNSUPPORTED_ANSWER_SWITCHING', confidence });
  }
  // POOR_CONFIDENCE_CALIBRATION is intentionally NOT derived from this struct —
  // it comes from ConfidenceCalibrationService, which has the real (band,
  // outcome) pairs. See DecisionInsightService for how the two are combined.

  return findings;
}

/** Plain, neutral, no-shame fallback text (§110) for when the AI gateway is
 *  unavailable or fails — see services/decisionInsightService.ts. */
export const TEMPLATE_BOTTLENECK_MESSAGES: Record<Bottleneck, string> = {
  TOO_MUCH_TIME:
    'Your uncertain decisions often run well past the expected time before you move on. Practicing when to stop could recover time for other questions.',
  TOO_MUCH_GUESSING:
    'A large share of your uncertain answers show no recorded evidence beforehand. Gathering one piece of evidence — even a partial elimination — tends to improve the odds.',
  TOO_MUCH_SKIPPING:
    'You are skipping some questions that look similar to ones you have historically answered well. It may be worth attempting a few of these before skipping.',
  WEAK_ELIMINATION:
    'On uncertain questions, you rarely reduce the option set before deciding. Elimination practice is likely to help here.',
  POOR_CONFIDENCE_CALIBRATION:
    'Your stated confidence and your actual accuracy do not consistently line up. Calibration practice can help your confidence better reflect your real chances.',
  UNSUPPORTED_ANSWER_SWITCHING:
    'Many of your answer changes are not accompanied by any recorded new evidence. Changing an answer is often fine — it helps to be able to name what changed your mind.',
};
