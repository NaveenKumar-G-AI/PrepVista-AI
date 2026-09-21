import { THRESHOLDS } from '../config/thresholds';
import { TrajectoryPoint, RegressionResult, EvidenceStrength } from '../types';

export interface RegressionContext {
  daysSinceLastActive?: number | null;
  retrievalDeclineDetected?: boolean;
  transferDeclineDetected?: boolean;
  simulationDeclineDetected?: boolean;
}

/**
 * SS12 Regression Detection.
 * Flags a meaningful, sustained drop (not single-session noise) and
 * lists *possible* contributors without claiming causation - every
 * factor is labeled SUPPORTED_PATTERN (co-occurring evidence exists) or
 * POSSIBLE_CONTRIBUTOR (plausible but unconfirmed), never "caused by".
 */
export function detectRegression(
  points: TrajectoryPoint[],
  metric: string,
  context: RegressionContext = {}
): RegressionResult {
  const cfg = THRESHOLDS.regression;
  const sorted = [...points].sort(
    (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
  );
  const recent = sorted.slice(-cfg.lookbackPoints);

  if (recent.length < 3) {
    return { metric, detected: false, cumulativeDrop: null, consecutiveDeclines: 0, possibleContributors: [] };
  }

  let consecutiveDeclines = 0;
  let maxConsecutive = 0;
  for (let i = 1; i < recent.length; i++) {
    if (recent[i].value < recent[i - 1].value) {
      consecutiveDeclines += 1;
      maxConsecutive = Math.max(maxConsecutive, consecutiveDeclines);
    } else {
      consecutiveDeclines = 0;
    }
  }

  const cumulativeDrop = recent[0].value - recent[recent.length - 1].value;
  const detected = cumulativeDrop >= cfg.minDropPoints && maxConsecutive >= cfg.minConsecutiveDeclines;

  const possibleContributors: { factor: string; strength: EvidenceStrength }[] = [];
  if (detected) {
    if (context.daysSinceLastActive !== null && context.daysSinceLastActive !== undefined &&
      context.daysSinceLastActive >= THRESHOLDS.risk.retentionGapDaysMedium) {
      possibleContributors.push({ factor: 'inactivity', strength: 'SUPPORTED_PATTERN' });
    }
    if (context.retrievalDeclineDetected) {
      possibleContributors.push({ factor: 'reduced_retrieval', strength: 'SUPPORTED_PATTERN' });
    }
    if (context.transferDeclineDetected) {
      possibleContributors.push({ factor: 'poor_transfer', strength: 'SUPPORTED_PATTERN' });
    }
    if (context.simulationDeclineDetected) {
      possibleContributors.push({ factor: 'realistic_performance_decline', strength: 'SUPPORTED_PATTERN' });
    }
    if (possibleContributors.length === 0) {
      possibleContributors.push({ factor: 'insufficient_reinforcement', strength: 'POSSIBLE_CONTRIBUTOR' });
    }
  }

  return {
    metric,
    detected,
    cumulativeDrop: Number(cumulativeDrop.toFixed(2)),
    consecutiveDeclines: maxConsecutive,
    possibleContributors,
  };
}
