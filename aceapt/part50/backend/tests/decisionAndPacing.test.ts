import { recommendAttemptDecision } from '../src/core/decisionEngine';
import { summarizePacing } from '../src/core/pacingEngine';
import { AttemptDecision } from '../src/types/domain';

describe('recommendAttemptDecision (spec 38, 59-61)', () => {
  it('recommends SKIP for a weak-area, expensive, non-goal-relevant question with limited time', () => {
    const result = recommendAttemptDecision({
      difficulty: 'HARD',
      estimatedTimeMs: 160000,
      remainingTimeMs: 300000,
      remainingQuestions: 6, // budget/question ~50s; 160s is far more expensive
      personalAccuracyAtDifficulty: 0.3,
      goalRelevant: false,
    });
    expect(result.recommendation).toBe(AttemptDecision.SKIP);
  });

  it('recommends RETURN_LATER instead of SKIP when the same question is goal-relevant', () => {
    const result = recommendAttemptDecision({
      difficulty: 'HARD',
      estimatedTimeMs: 160000,
      remainingTimeMs: 300000,
      remainingQuestions: 6,
      personalAccuracyAtDifficulty: 0.3,
      goalRelevant: true,
    });
    expect(result.recommendation).toBe(AttemptDecision.RETURN_LATER);
  });

  it('recommends ATTEMPT for a comfortable, time-cheap question', () => {
    const result = recommendAttemptDecision({
      difficulty: 'EASY',
      estimatedTimeMs: 30000,
      remainingTimeMs: 300000,
      remainingQuestions: 6,
      personalAccuracyAtDifficulty: 0.9,
      goalRelevant: false,
    });
    expect(result.recommendation).toBe(AttemptDecision.ATTEMPT);
  });

  it('never exposes a raw numeric score to the caller (spec 61)', () => {
    const result = recommendAttemptDecision({
      difficulty: 'MEDIUM',
      estimatedTimeMs: 60000,
      remainingTimeMs: 300000,
      remainingQuestions: 6,
      personalAccuracyAtDifficulty: 0.7,
      goalRelevant: false,
    });
    const keys = Object.keys(result);
    expect(keys).toEqual(['recommendation', 'rationale']);
    expect(typeof result.recommendation).toBe('string');
    expect(typeof result.rationale).toBe('string');
  });
});

describe('summarizePacing (spec 39, 62-65, difficulty/pace fairness spec 138)', () => {
  it('flags BEHIND pace but with an encouraging message when accuracy is strong', () => {
    const summary = summarizePacing({ totalQuestions: 30, timeBudgetMs: 30 * 60000, elapsedMs: 12 * 60000, questionsCompleted: 9, correctCount: 8 });
    expect(summary.paceStatus).toBe('BEHIND');
    expect(summary.message.toLowerCase()).toContain('accuracy is strong');
  });

  it('flags AHEAD pace but warns to slow down when accuracy is weak', () => {
    const summary = summarizePacing({ totalQuestions: 30, timeBudgetMs: 30 * 60000, elapsedMs: 5 * 60000, questionsCompleted: 10, correctCount: 6 });
    expect(summary.paceStatus).toBe('AHEAD');
    expect(summary.message.toLowerCase()).toContain('slow down');
  });

  it('does not force equal time per question - only compares aggregate pace', () => {
    const summary = summarizePacing({ totalQuestions: 20, timeBudgetMs: 20 * 60000, elapsedMs: 10 * 60000, questionsCompleted: 10, correctCount: 9 });
    expect(summary.paceStatus).toBe('ON_TRACK');
  });
});
