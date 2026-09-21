// Decision Engine: SOLVE / SKIP / RETURN judgment (spec sections 38, 59-61).
// Internally weighs cost against remaining budget, but the DTO returned to
// the student only ever carries a recommendation + plain-language rationale
// - never the underlying numeric score (spec 61: "do not expose an
// arbitrary hidden numerical value to the student").

import { AttemptDecision, Difficulty } from '../types/domain';

export interface DecisionInputs {
  difficulty: Difficulty;
  estimatedTimeMs: number | null; // from resolveExpectedTime; null is handled gracefully
  remainingTimeMs: number;
  remainingQuestions: number;
  personalAccuracyAtDifficulty: number | null; // from a difficulty-scoped baseline
  goalRelevant: boolean;
}

export interface DecisionRecommendation {
  recommendation: AttemptDecision;
  rationale: string;
}

const WEAK_AREA_ACCURACY_THRESHOLD = 0.5;
const EXPENSIVE_COST_RATIO = 1.6;

export function recommendAttemptDecision(input: DecisionInputs): DecisionRecommendation {
  const avgRemainingBudgetPerQuestion =
    input.remainingQuestions > 0 ? input.remainingTimeMs / input.remainingQuestions : input.remainingTimeMs;

  const estimatedCostRatio =
    input.estimatedTimeMs && avgRemainingBudgetPerQuestion > 0 ? input.estimatedTimeMs / avgRemainingBudgetPerQuestion : 1;

  const weakArea = input.personalAccuracyAtDifficulty !== null && input.personalAccuracyAtDifficulty < WEAK_AREA_ACCURACY_THRESHOLD;
  const expensive = estimatedCostRatio > EXPENSIVE_COST_RATIO;

  if (weakArea && expensive && !input.goalRelevant) {
    return {
      recommendation: AttemptDecision.SKIP,
      rationale: 'This is significantly harder than your comfortable range right now and time is limited - worth skipping and returning if time allows.',
    };
  }
  if (weakArea && expensive && input.goalRelevant) {
    return {
      recommendation: AttemptDecision.RETURN_LATER,
      rationale: 'This lines up with your goal, but it is costly right now - flag it and come back after securing quicker wins.',
    };
  }
  if (expensive && !weakArea) {
    return {
      recommendation: AttemptDecision.RETURN_LATER,
      rationale: 'You can likely solve this, but it will take a while - consider banking quicker questions first.',
    };
  }
  return {
    recommendation: AttemptDecision.ATTEMPT,
    rationale: 'This is within your comfortable range for the time remaining.',
  };
}
