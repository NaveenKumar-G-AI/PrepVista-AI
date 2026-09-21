import { describe, expect, it } from 'vitest';
import {
  breakEvenProbability,
  estimateOpportunityCost,
  expectedValueOfAttempt,
  isAttemptFavored,
} from '../../src/domain/expectedValue';

describe('breakEvenProbability', () => {
  it('matches the classic -1/4 negative marking result: 20% break-even on a 4-option MCQ', () => {
    // This is the textbook "eliminate at least one of four options and guessing
    // is worth it" result: p* = (0 + 0.25) / (1 + 0.25) = 0.2
    const p = breakEvenProbability({ correctReward: 1, wrongPenalty: 0.25, blankValue: 0 });
    expect(p).toBeCloseTo(0.2, 5);
  });

  it('is 0 when there is no penalty for a wrong answer', () => {
    const p = breakEvenProbability({ correctReward: 1, wrongPenalty: 0, blankValue: 0 });
    expect(p).toBe(0);
  });

  it('returns NaN for a degenerate policy rather than a misleading number', () => {
    const p = breakEvenProbability({ correctReward: 0, wrongPenalty: 0, blankValue: 0 });
    expect(Number.isNaN(p)).toBe(true);
  });
});

describe('expectedValueOfAttempt', () => {
  it('computes EV correctly at the break-even point (EV of attempt ≈ EV of blank)', () => {
    const policy = { correctReward: 1, wrongPenalty: 0.25, blankValue: 0 };
    const ev = expectedValueOfAttempt(20, policy); // 20% = break-even
    expect(ev).toBeCloseTo(0, 5);
  });

  it('favors attempting once probability clears the break-even threshold (e.g. eliminating 1 of 4 options)', () => {
    const policy = { correctReward: 1, wrongPenalty: 0.25, blankValue: 0 };
    // After eliminating 1 of 4 options, a uniform guess among the remaining 3 is ~33%
    expect(isAttemptFavored(33, policy)).toBe(true);
    expect(isAttemptFavored(10, policy)).toBe(false);
  });

  it('returns null (not a guess) when the policy is degenerate', () => {
    expect(isAttemptFavored(50, { correctReward: 0, wrongPenalty: 0, blankValue: 0 })).toBeNull();
  });
});

describe('estimateOpportunityCost', () => {
  it('estimates how many easier questions the same time could have answered', () => {
    const result = estimateOpportunityCost({
      elapsedSeconds: 150,
      expectedSecondsPerEasierQuestion: 50,
      estimatedEasierQuestionAccuracy: 0.8,
      easierQuestionPolicy: { correctReward: 1, wrongPenalty: 0, blankValue: 0 },
    });
    expect(result.potentialAdditionalQuestions).toBe(3);
    expect(result.forgoneExpectedValue).toBeCloseTo(3 * 0.8, 5);
  });

  it('does not divide by zero when expected time per question is not set', () => {
    const result = estimateOpportunityCost({
      elapsedSeconds: 100,
      expectedSecondsPerEasierQuestion: 0,
      estimatedEasierQuestionAccuracy: 0.5,
      easierQuestionPolicy: { correctReward: 1, wrongPenalty: 0, blankValue: 0 },
    });
    expect(result.potentialAdditionalQuestions).toBe(0);
  });
});
