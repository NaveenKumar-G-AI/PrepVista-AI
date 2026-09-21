import { describe, it, expect } from 'vitest';
import { classifyEffectiveness, computeImmediateOutcome, applyRetentionCheck } from '../src/engine/outcome';
import { InterventionExecution } from '../src/domain/types';

describe('classifyEffectiveness', () => {
  it('classifies a large positive delta as SUCCESSFUL', () => expect(classifyEffectiveness(15)).toBe('SUCCESSFUL'));
  it('classifies a small positive delta as PARTIALLY_EFFECTIVE', () => expect(classifyEffectiveness(6)).toBe('PARTIALLY_EFFECTIVE'));
  it('classifies a near-zero delta as NO_MEASURABLE_CHANGE', () => expect(classifyEffectiveness(1)).toBe('NO_MEASURABLE_CHANGE'));
  it('classifies a negative delta as NEGATIVE_RESPONSE', () => expect(classifyEffectiveness(-10)).toBe('NEGATIVE_RESPONSE'));
  it('classifies a null delta as INSUFFICIENT_DATA', () => expect(classifyEffectiveness(null)).toBe('INSUFFICIENT_DATA'));
});

describe('outcome pipeline — matches the spec demo story (before 59, immediate 74, retention 79)', () => {
  it('produces SUCCESSFUL for both the immediate and the retention check', () => {
    const execution: InterventionExecution = {
      id: 'exec_1',
      decisionId: 'dec_1',
      studentId: 'student_102',
      type: 'TIMED_DRILL',
      contract: { type: 'TIMED_DRILL', topic: 'Probability', focusAreas: [] },
      status: 'COMPLETED',
      startedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      result: { accuracyPct: 74, questionsCompleted: 10 }
    };

    const outcome = computeImmediateOutcome(execution, 59);
    expect(outcome.immediateEffectiveness).toBe('SUCCESSFUL');

    const withRetention = applyRetentionCheck(outcome, {
      topic: 'Probability',
      daysAfter: 7,
      accuracyPct: 79,
      measuredAt: new Date().toISOString()
    });
    expect(withRetention.retentionEffectiveness).toBe('SUCCESSFUL');
  });

  it('produces INSUFFICIENT_DATA when there is no baseline to compare against', () => {
    const execution: InterventionExecution = {
      id: 'exec_2',
      decisionId: 'dec_2',
      studentId: 'student_new',
      type: 'CONCEPT_RETEACH',
      contract: { type: 'CONCEPT_RETEACH', topic: 'Ratios', focusAreas: [] },
      status: 'COMPLETED',
      result: { accuracyPct: 80, questionsCompleted: 5 }
    };
    const outcome = computeImmediateOutcome(execution, null);
    expect(outcome.immediateEffectiveness).toBe('INSUFFICIENT_DATA');
  });
});
