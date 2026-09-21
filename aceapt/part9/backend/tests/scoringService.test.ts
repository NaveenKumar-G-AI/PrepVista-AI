import { describe, expect, it } from 'vitest';
import { SimulationScoringService } from '../src/services/simulationScoringService';
import { AnswerRecord } from '../src/domain/types';

function answer(overrides: Partial<AnswerRecord>): AnswerRecord {
  return {
    questionId: 'q',
    selectedOptionId: null,
    previousOptionIds: [],
    isCorrect: null,
    firstOpenedAt: null,
    answeredAt: null,
    timeSpentSeconds: 0,
    skipped: false,
    returned: false,
    remainingTimeFractionAtAnswer: null,
    ...overrides,
  };
}

describe('SimulationScoringService.computeRawScore', () => {
  const scoring = new SimulationScoringService();
  const negativeMarking = { correct: 1, wrong: -0.25, skipped: 0 };

  it('applies negative marking only to wrong answers, never to skips', () => {
    const answers: AnswerRecord[] = [
      answer({ questionId: 'q1', selectedOptionId: 'a', isCorrect: true }),
      answer({ questionId: 'q2', selectedOptionId: 'b', isCorrect: false }),
      answer({ questionId: 'q3', skipped: true }),
      answer({ questionId: 'q4' }), // never touched
    ];

    const result = scoring.computeRawScore(answers, 4, negativeMarking);

    expect(result.correctCount).toBe(1);
    expect(result.wrongCount).toBe(1);
    expect(result.skippedCount).toBe(2); // explicit skip + untouched both count as "no attempt"
    expect(result.rawScore).toBeCloseTo(1 - 0.25, 5);
    expect(result.accuracyPercent).toBe(25);
  });

  it('never lets negative marking push the raw score display below what the rule allows', () => {
    const allWrong: AnswerRecord[] = [
      answer({ questionId: 'q1', selectedOptionId: 'a', isCorrect: false }),
      answer({ questionId: 'q2', selectedOptionId: 'b', isCorrect: false }),
    ];
    const result = scoring.computeRawScore(allWrong, 2, negativeMarking);
    expect(result.rawScore).toBeCloseTo(-0.5, 5);
    expect(result.accuracyPercent).toBe(0);
  });
});

describe('SimulationScoringService.overallScore', () => {
  const scoring = new SimulationScoringService();

  it('is bounded between 0 and 100 regardless of input', () => {
    const perfect = scoring.overallScore({
      accuracy: 100,
      speed: 100,
      decisionQuality: 100,
      timeManagement: 100,
      consistency: 100,
      recovery: 100,
      endurance: 100,
    });
    expect(perfect).toBe(100);

    const zero = scoring.overallScore({
      accuracy: 0,
      speed: 0,
      decisionQuality: 0,
      timeManagement: 0,
      consistency: 0,
      recovery: 0,
      endurance: 0,
    });
    expect(zero).toBe(0);
  });
});
