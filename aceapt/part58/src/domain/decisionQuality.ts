/**
 * Decision quality (§21-22, §62-63, §151-152, §170-171). This is the single
 * most important file for the product's central promise: a decision is judged
 * on the information available when it was made, never on hindsight.
 *
 * That's enforced structurally, not just by convention: DecisionQualityInput
 * below has no `isCorrect` / outcome field at all, so assessProcessQuality()
 * physically cannot see the outcome. Correctness is scored separately by
 * assessOutcome() and the two are only ever combined for *display*, never
 * for computing one another.
 */
import type {
  DecisionAction,
  DecisionOutcome,
  DecisionPolicy,
  DecisionQualityProfile,
  EvidenceSignal,
  QualityRating,
  UncertaintyState,
} from '../types';
import { classifyEliminationEvidence } from './elimination';
import { suggestActionsForTraining } from './policyRules';

export interface DecisionQualityInput {
  action: DecisionAction;
  uncertaintyState?: UncertaintyState | null;
  evidenceUsed: EvidenceSignal[];
  totalOptions?: number | null;
  eliminatedOptionIds: string[];
  elapsedTimeSeconds: number;
  questionExpectedTimeSeconds?: number | null;
  remainingTestTimeSeconds?: number | null;
  policy?: DecisionPolicy | null;
  confidenceBand?: string | null;
  /** Optional externally-computed calibration signal for THIS band, from an
   *  aggregate with enough samples — never fabricated from a single decision. */
  comparableCalibration?: { withinExpectedRange: boolean; sampleSize: number } | null;
}
// Deliberately no `isCorrect` field above — see file header.

const CONTINUE_LIKE_ACTIONS: DecisionAction[] = ['FULL_SOLVE', 'PARTIAL_SOLVE', 'CONTINUE'];
const RISK_MITIGATING_ACTIONS: DecisionAction[] = ['ELIMINATE', 'ESTIMATE', 'SKIP', 'RETURN_LATER', 'INFORMED_GUESS'];
const MIN_SAMPLE_FOR_PER_DECISION_CALIBRATION = 8;

function rateEvidenceUsed(action: DecisionAction, evidence: EvidenceSignal[]): QualityRating {
  if (action === 'SKIP' || action === 'RETURN_LATER') return 'NOT_ASSESSABLE'; // skipping doesn't require generating evidence
  if (evidence.length === 0) return 'LOW';
  const level = classifyEliminationEvidence(evidence);
  if (evidence.length >= 3 || level === 'VERIFIED' || level === 'OBSERVED') return 'HIGH';
  return 'MEDIUM';
}

function rateOptionReduction(totalOptions: number | null | undefined, eliminatedCount: number): QualityRating {
  if (!totalOptions || totalOptions <= 1) return 'NOT_ASSESSABLE';
  if (eliminatedCount <= 0) return 'LOW';
  const ratio = eliminatedCount / (totalOptions - 1); // can't eliminate the true answer
  if (ratio >= 0.5) return 'HIGH';
  return 'MEDIUM';
}

function rateTimeAwareness(input: DecisionQualityInput): QualityRating {
  if (!input.questionExpectedTimeSeconds) return 'NOT_ASSESSABLE';
  const ratio = input.elapsedTimeSeconds / input.questionExpectedTimeSeconds;
  const stillPushingForward = CONTINUE_LIKE_ACTIONS.includes(input.action);
  if (stillPushingForward && ratio > 1.5) return 'LOW'; // pushed on well past the expected time
  if (ratio <= 1.3) return 'HIGH';
  return 'MEDIUM';
}

function rateRiskAwareness(input: DecisionQualityInput): QualityRating {
  if (!input.policy || input.policy.source === 'UNKNOWN') return 'NOT_ASSESSABLE';
  const meaningfulPenalty = input.policy.wrongPenalty > 0;
  const uncertain = input.uncertaintyState === 'UNCERTAIN' || input.uncertaintyState === 'LOW_CONFIDENCE' || input.uncertaintyState === 'NO_USEFUL_EVIDENCE';
  if (!uncertain) return 'NOT_ASSESSABLE'; // risk awareness is only meaningful under uncertainty
  if (input.action === 'BLIND_GUESS' && meaningfulPenalty) return 'LOW';
  if (RISK_MITIGATING_ACTIONS.includes(input.action)) return 'HIGH';
  return 'MEDIUM';
}

/**
 * Per-decision calibration quality is intentionally conservative: a single
 * data point cannot tell you whether confidence is well-calibrated — that is
 * inherently an aggregate property (see domain/calibration.ts +
 * ConfidenceCalibrationService). This only returns a rating when the caller
 * supplies an aggregate signal with enough samples; otherwise NOT_ASSESSABLE.
 */
function rateConfidenceCalibration(input: DecisionQualityInput): QualityRating {
  if (!input.comparableCalibration || input.comparableCalibration.sampleSize < MIN_SAMPLE_FOR_PER_DECISION_CALIBRATION) {
    return 'NOT_ASSESSABLE';
  }
  return input.comparableCalibration.withinExpectedRange ? 'HIGH' : 'LOW';
}

function rateActionAppropriateness(input: DecisionQualityInput): QualityRating {
  const suggested = suggestActionsForTraining({
    uncertaintyState: input.uncertaintyState,
    remainingTestTimeSeconds: input.remainingTestTimeSeconds,
    questionExpectedTimeSeconds: input.questionExpectedTimeSeconds,
    elapsedTimeSeconds: input.elapsedTimeSeconds,
    policy: input.policy,
  });
  if (suggested.length === 0) return 'NOT_ASSESSABLE'; // no rule matched this context confidently
  return suggested.includes(input.action) ? 'HIGH' : 'MEDIUM'; // never LOW here — see policyRules.ts header
}

export function assessProcessQuality(input: DecisionQualityInput): DecisionQualityProfile {
  return {
    evidenceUsed: rateEvidenceUsed(input.action, input.evidenceUsed),
    optionReduction: rateOptionReduction(input.totalOptions, input.eliminatedOptionIds.length),
    timeAwareness: rateTimeAwareness(input),
    riskAwareness: rateRiskAwareness(input),
    confidenceCalibration: rateConfidenceCalibration(input),
    actionAppropriateness: rateActionAppropriateness(input),
  };
}

export function assessOutcome(isCorrect: boolean | null): DecisionOutcome {
  return { isCorrect };
}

/**
 * Builds a short, neutral, evidence-based explanation in the spirit of §247 —
 * explicitly keeps process and outcome as separate clauses and never implies
 * the student "should have known" something unavailable at decision time.
 */
export function explainDecision(input: DecisionQualityInput, outcome: DecisionOutcome): string {
  const quality = assessProcessQuality(input);
  const evidenceCount = input.evidenceUsed.length;
  const processClause =
    quality.evidenceUsed === 'HIGH' || quality.optionReduction === 'HIGH'
      ? `You gathered evidence before deciding (${evidenceCount} signal${evidenceCount === 1 ? '' : 's'} recorded).`
      : evidenceCount > 0
      ? `You had some evidence (${evidenceCount} signal${evidenceCount === 1 ? '' : 's'}) but the final choice still involved real uncertainty.`
      : `No evidence was recorded before this decision.`;
  const outcomeClause =
    outcome.isCorrect === null
      ? 'The outcome is not graded yet.'
      : outcome.isCorrect
      ? 'The answer turned out to be correct.'
      : 'The answer turned out to be incorrect.';
  return `${processClause} ${outcomeClause}`;
}
