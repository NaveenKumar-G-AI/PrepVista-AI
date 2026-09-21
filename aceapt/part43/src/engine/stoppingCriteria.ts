import { AdaptiveDiagnosticState } from '../domain/state';
import { EvidenceConfidence, Skill } from '../domain/types';
import { ENGINE_CONSTANTS as C } from './constants';

export interface StoppingDecision {
  shouldStop: boolean;
  reason: string;
  message: string;
}

/**
 * Stops on (in order): hitting the hard question cap, having sufficient
 * evidence everywhere in scope, or diminishing returns on the best
 * remaining candidate - never merely "N questions completed" (spec
 * sections 37-39). Fatigue never forces a stop by itself; it's surfaced as
 * a recommendation the caller (frontend) can act on (spec section 40).
 */
export function evaluateStopping(
  state: AdaptiveDiagnosticState,
  scopedSkills: Skill[],
  bestRemainingScore: number | null
): StoppingDecision {
  if (state.questionsAsked >= state.config.maxQuestions) {
    return {
      shouldStop: true,
      reason: 'max_questions_reached',
      message: "We've reached the question limit for this session, so let's wrap up your profile.",
    };
  }

  const coverageSatisfied = Object.values(state.coverage).every((c) => c.satisfied);
  const targetRank = confidenceRank(state.config.targetEvidenceConfidence);
  const evidenceSufficient = scopedSkills.every((s) => {
    const e = state.skillEvidence[s.id];
    return (
      !!e &&
      confidenceRank(e.confidenceLabel) >= targetRank &&
      !e.needsSpeedCheck &&
      !e.needsRushInvestigation &&
      e.calibrationFlag === 'none'
    );
  });

  if (state.questionsAsked >= state.config.minQuestions && coverageSatisfied && evidenceSufficient) {
    return {
      shouldStop: true,
      reason: 'sufficient_evidence',
      message: "We've learned enough to build your current aptitude profile.",
    };
  }

  if (
    state.questionsAsked >= state.config.minQuestions &&
    bestRemainingScore !== null &&
    bestRemainingScore < C.MIN_INFO_VALUE_TO_CONTINUE
  ) {
    return {
      shouldStop: true,
      reason: 'diminishing_returns',
      message: "We've learned enough to build your current aptitude profile.",
    };
  }

  if (state.fatigue.severity === 'high') {
    return {
      shouldStop: false,
      reason: 'fatigue_pause_recommended',
      message: "Let's pause here for now and continue later so your results stay accurate.",
    };
  }

  return {
    shouldStop: false,
    reason: 'continue',
    message: "Let's explore one more area so we can make your profile more accurate.",
  };
}

function confidenceRank(c: EvidenceConfidence): number {
  return { low: 0, moderate: 1, high: 2 }[c];
}
