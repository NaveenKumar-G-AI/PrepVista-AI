import { describe, it, expect } from 'vitest';
import { isColdStart } from '../src/engine/coldStart';
import { StudentState } from '../src/domain/types';

function baseState(overrides: Partial<StudentState> = {}): StudentState {
  return {
    studentId: 's1',
    generatedAt: new Date().toISOString(),
    recentPerformance: [],
    behaviorProfile: 'unavailable',
    persistence: 'unavailable',
    consistency: 'unavailable',
    availableStudyMinutes: 'unavailable',
    assessmentDeadline: 'unavailable',
    readiness: 'unavailable',
    interventionHistory: [],
    retentionSignals: 'unavailable',
    transferSignals: 'unavailable',
    ...overrides
  };
}

describe('isColdStart', () => {
  it('is true for a brand new student with no intervention history', () => {
    expect(isColdStart(baseState())).toBe(true);
  });

  it('is true with only one prior intervention', () => {
    expect(
      isColdStart(baseState({ interventionHistory: [{ interventionId: 'a', type: 'TIMED_DRILL', topic: 'Probability' }] }))
    ).toBe(true);
  });

  it('is false once a student has enough intervention history', () => {
    expect(
      isColdStart(
        baseState({
          interventionHistory: [
            { interventionId: 'a', type: 'TIMED_DRILL', topic: 'Probability' },
            { interventionId: 'b', type: 'TIMED_DRILL', topic: 'Probability' }
          ]
        })
      )
    ).toBe(false);
  });
});
