/**
 * Expected-value math (§34, §239 P1). Pure functions, no I/O.
 *
 * Only call these when policy.source === 'VERIFIED' — an 'UNKNOWN' policy
 * means the real scoring rules for this assessment aren't confirmed, and
 * §121 says do not calculate expected value in that case. The services layer
 * enforces this; these functions just do the arithmetic correctly once given
 * real numbers.
 */
import type { ConfidenceBand } from '../types';

export interface ScoringInputs {
  correctReward: number;
  /** Non-negative magnitude deducted from score on a wrong attempt. */
  wrongPenalty: number;
  blankValue: number;
}

/**
 * The probability of being correct at which attempting and leaving blank have
 * equal expected value. Below this threshold, blank is better; above it,
 * attempting is better. This is the actual math behind "if you can eliminate
 * at least one of four options under -1/4 negative marking, guessing is
 * worth it": p* = (blankValue + wrongPenalty) / (correctReward + wrongPenalty).
 *
 * Returns NaN if the policy is degenerate (correctReward + wrongPenalty <= 0),
 * meaning break-even isn't a meaningful concept for it — callers should treat
 * NaN as "not computable" rather than defaulting it to 0 or 1.
 */
export function breakEvenProbability(policy: ScoringInputs): number {
  const denom = policy.correctReward + policy.wrongPenalty;
  if (!(denom > 0)) return NaN;
  const p = (policy.blankValue + policy.wrongPenalty) / denom;
  return Math.min(1, Math.max(0, p));
}

export function expectedValueOfAttempt(probabilityCorrectPercent: number, policy: ScoringInputs): number {
  const p = Math.min(1, Math.max(0, probabilityCorrectPercent / 100));
  return p * policy.correctReward - (1 - p) * policy.wrongPenalty;
}

export function expectedValueOfBlank(policy: ScoringInputs): number {
  return policy.blankValue;
}

/**
 * Returns null when the policy is degenerate and the comparison isn't
 * meaningful (never silently assume a direction in that case).
 */
export function isAttemptFavored(probabilityCorrectPercent: number, policy: ScoringInputs): boolean | null {
  const breakEven = breakEvenProbability(policy);
  if (Number.isNaN(breakEven)) return null;
  return probabilityCorrectPercent / 100 > breakEven;
}

/**
 * Illustrative, clearly-labeled default mapping from a confidence band to a
 * conservative probability RANGE (not a point estimate — see §58 "no false
 * precision"). This is a starting default, not a measured constant. Replace
 * it with calibration-derived ranges once ConfidenceCalibrationService has
 * enough paired (confidence, outcome) data for this population.
 */
export const ILLUSTRATIVE_BAND_PROBABILITY_RANGE: Record<ConfidenceBand, [number, number]> = {
  VERY_LOW: [0, 20],
  LOW: [20, 40],
  MEDIUM: [40, 60],
  HIGH: [60, 80],
  VERY_HIGH: [80, 100],
};

export function expectedValueRangeForBand(band: ConfidenceBand, policy: ScoringInputs): [number, number] {
  const [lo, hi] = ILLUSTRATIVE_BAND_PROBABILITY_RANGE[band];
  const values = [expectedValueOfAttempt(lo, policy), expectedValueOfAttempt(hi, policy)];
  return [Math.min(...values), Math.max(...values)];
}

/**
 * Opportunity-cost estimate (§38, §239 P1): what continuing on this question
 * may be costing in terms of easier questions left unanswered. Deliberately
 * simple and transparent rather than a black-box "smart" number — every input
 * is something the caller chose, not something inferred silently.
 */
export function estimateOpportunityCost(params: {
  elapsedSeconds: number;
  expectedSecondsPerEasierQuestion: number;
  estimatedEasierQuestionAccuracy: number; // 0-1
  easierQuestionPolicy: ScoringInputs;
}): { potentialAdditionalQuestions: number; forgoneExpectedValue: number } {
  if (params.expectedSecondsPerEasierQuestion <= 0) {
    return { potentialAdditionalQuestions: 0, forgoneExpectedValue: 0 };
  }
  const potentialAdditionalQuestions = Math.floor(
    params.elapsedSeconds / params.expectedSecondsPerEasierQuestion
  );
  const evPerEasierAttempt = expectedValueOfAttempt(
    params.estimatedEasierQuestionAccuracy * 100,
    params.easierQuestionPolicy
  );
  return {
    potentialAdditionalQuestions,
    forgoneExpectedValue: potentialAdditionalQuestions * evPerEasierAttempt,
  };
}
