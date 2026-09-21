import { describe, expect, it } from 'vitest';
import { DecisionTrackingService } from '../src/services/decisionTrackingService';
import { AnswerRecord, Question } from '../src/domain/types';

const decisions = new DecisionTrackingService();

const question: Question = {
  id: 'q1',
  skill: 'percentage',
  difficulty: 'medium',
  prompt: 'irrelevant',
  options: [],
  correctOptionId: 'a',
  expectedSolveTimeSeconds: 60,
};

function answer(overrides: Partial<AnswerRecord>): AnswerRecord {
  return {
    questionId: 'q1',
    selectedOptionId: 'a',
    previousOptionIds: [],
    isCorrect: true,
    firstOpenedAt: 0,
    answeredAt: 0,
    timeSpentSeconds: 60,
    skipped: false,
    returned: false,
    remainingTimeFractionAtAnswer: 0.5,
    ...overrides,
  };
}

describe('DecisionTrackingService.classify', () => {
  it('CORRECT_EFFICIENT: correct answer at or under the time budget', () => {
    const outcome = decisions.classify(answer({ isCorrect: true, timeSpentSeconds: 50 }), question);
    expect(outcome).toBe('CORRECT_EFFICIENT');
  });

  it('CORRECT_INEFFICIENT: correct answer that took far longer than expected', () => {
    const outcome = decisions.classify(answer({ isCorrect: true, timeSpentSeconds: 240 }), question);
    expect(outcome).toBe('CORRECT_INEFFICIENT');
  });

  it('WRONG_QUICK: wrong answer submitted very fast (guess-like)', () => {
    const outcome = decisions.classify(answer({ isCorrect: false, timeSpentSeconds: 15 }), question);
    expect(outcome).toBe('WRONG_QUICK');
  });

  it('WRONG_EXCESSIVE_TIME: wrong answer that still took a long time', () => {
    const outcome = decisions.classify(answer({ isCorrect: false, timeSpentSeconds: 150 }), question);
    expect(outcome).toBe('WRONG_EXCESSIVE_TIME');
  });

  it('SKIPPED_GOOD_DECISION: skipped a hard question and never returned', () => {
    const hard: Question = { ...question, difficulty: 'hard' };
    const outcome = decisions.classify(
      answer({ skipped: true, selectedOptionId: null, isCorrect: null, returned: false }),
      hard,
    );
    expect(outcome).toBe('SKIPPED_GOOD_DECISION');
  });

  it('SKIPPED_MISSED_OPPORTUNITY: skipped an easy question and never returned', () => {
    const easy: Question = { ...question, difficulty: 'easy' };
    const outcome = decisions.classify(
      answer({ skipped: true, selectedOptionId: null, isCorrect: null, returned: false }),
      easy,
    );
    expect(outcome).toBe('SKIPPED_MISSED_OPPORTUNITY');
  });

  it('SKIPPED_GOOD_DECISION: returned to a skipped question and got it right', () => {
    const outcome = decisions.classify(
      answer({ skipped: true, returned: true, selectedOptionId: 'a', isCorrect: true }),
      question,
    );
    expect(outcome).toBe('SKIPPED_GOOD_DECISION');
  });
});
