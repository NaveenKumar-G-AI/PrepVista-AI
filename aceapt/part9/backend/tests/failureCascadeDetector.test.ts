import { describe, expect, it } from 'vitest';
import { FailureCascadeDetector } from '../src/services/failureCascadeDetector';
import { AnswerRecord, Question } from '../src/domain/types';

const detector = new FailureCascadeDetector();

function q(id: string): Question {
  return {
    id,
    skill: 'arithmetic',
    difficulty: 'medium',
    prompt: 'irrelevant',
    options: [],
    correctOptionId: 'a',
    expectedSolveTimeSeconds: 60,
  };
}

function a(id: string, isCorrect: boolean, timeSpentSeconds: number): AnswerRecord {
  return {
    questionId: id,
    selectedOptionId: 'a',
    previousOptionIds: [],
    isCorrect,
    firstOpenedAt: 0,
    answeredAt: 0,
    timeSpentSeconds,
    skipped: false,
    returned: false,
    remainingTimeFractionAtAnswer: 0.3,
  };
}

describe('FailureCascadeDetector', () => {
  it('detects a time-loss cascade: one very slow question followed by rushed, wrong answers', () => {
    const answers = [
      a('q1', true, 55),
      a('q2', true, 58),
      a('q3', true, 200), // trigger: ~3.3x expected time
      a('q4', false, 15), // rushed + wrong
      a('q5', false, 12), // rushed + wrong
      a('q6', true, 58),
    ];
    const questions = new Map(['q1', 'q2', 'q3', 'q4', 'q5', 'q6'].map((id) => [id, q(id)]));

    const findings = detector.detect(answers, questions);

    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('TIME_LOSS_CASCADE');
    expect(findings[0].evidence.triggerQuestionId).toBe('q3');
    expect(findings[0].confidence).toBeGreaterThan(0.5);
    expect(findings[0].confidence).toBeLessThanOrEqual(0.95);
  });

  it('does not flag a cascade when pace and accuracy stay normal after a slow question', () => {
    const answers = [
      a('q1', true, 55),
      a('q2', true, 200), // slow but...
      a('q3', true, 55), // ...still accurate and on-pace afterwards
      a('q4', true, 58),
      a('q5', true, 60),
    ];
    const questions = new Map(['q1', 'q2', 'q3', 'q4', 'q5'].map((id) => [id, q(id)]));

    const findings = detector.detect(answers, questions);
    expect(findings).toHaveLength(0);
  });
});
