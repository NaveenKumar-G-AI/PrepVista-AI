import { detectAbandonmentSignal } from '../src/domain/signals/abandonment';
import { detectQuestionFrictionSignals, detectCrossStudentQuestionFriction } from '../src/domain/signals/friction';
import { BehaviorEvent } from '../src/types/events';

const NOW = new Date('2026-08-25T12:00:00.000Z');
let counter = 0;
function mkEvent(studentId: string, overrides: Partial<BehaviorEvent>): BehaviorEvent {
  counter += 1;
  return {
    id: `e-${counter}`,
    studentId,
    type: 'QUESTION_STARTED',
    occurredAtUtc: NOW.toISOString(),
    timezoneOffsetMinutes: 330,
    ...overrides,
  };
}

describe('detectAbandonmentSignal', () => {
  it('flags REPEATED_SESSION_ABANDONMENT when abandonment points cluster, and never states a single confident cause', () => {
    const events = [0.68, 0.71, 0.7].map((p) => mkEvent('student-1', { type: 'ASSESSMENT_ABANDONED', progressFraction: p }));
    const signal = detectAbandonmentSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('REPEATED_SESSION_ABANDONMENT');
    expect(signal.possibleExplanations && signal.possibleExplanations.length).toBeGreaterThan(1);
  });

  it('labels SCATTERED_ABANDONMENT when abandonment points vary widely', () => {
    const events = [0.1, 0.5, 0.9].map((p) => mkEvent('student-1', { type: 'ASSESSMENT_ABANDONED', progressFraction: p }));
    const signal = detectAbandonmentSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('SCATTERED_ABANDONMENT');
  });

  it('returns INSUFFICIENT_EVIDENCE with no abandoned sessions', () => {
    const signal = detectAbandonmentSignal([], 'student-1', NOW);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('detectQuestionFrictionSignals (per-student)', () => {
  it('flags a question with a high skip rate for one student', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 5; i++) {
      events.push(mkEvent('student-1', { type: 'QUESTION_STARTED', questionId: 'q-x', sessionId: `s${i}` }));
      events.push(mkEvent('student-1', { type: 'QUESTION_SKIPPED', questionId: 'q-x', sessionId: `s${i}` }));
    }
    const signals = detectQuestionFrictionSignals(events, 'student-1', NOW);
    expect(signals.length).toBeGreaterThan(0);
    expect(signals[0].label).toBe('STUDENT_LEVEL_FRICTION');
  });
});

describe('detectCrossStudentQuestionFriction', () => {
  it('returns null when too few distinct students are involved', () => {
    const events: BehaviorEvent[] = [];
    for (const sid of ['s1', 's2']) {
      events.push(mkEvent(sid, { type: 'QUESTION_STARTED', questionId: 'q-shared' }));
      events.push(mkEvent(sid, { type: 'QUESTION_SKIPPED', questionId: 'q-shared' }));
    }
    expect(detectCrossStudentQuestionFriction(events, 'q-shared', NOW)).toBeNull();
  });

  it('flags CONTENT_LEVEL_FRICTION when many distinct students all struggle with the same question', () => {
    const events: BehaviorEvent[] = [];
    for (const sid of ['s1', 's2', 's3', 's4', 's5']) {
      events.push(mkEvent(sid, { type: 'QUESTION_STARTED', questionId: 'q-shared' }));
      events.push(mkEvent(sid, { type: 'QUESTION_SKIPPED', questionId: 'q-shared' }));
    }
    const signal = detectCrossStudentQuestionFriction(events, 'q-shared', NOW);
    expect(signal).not.toBeNull();
    expect(signal?.label).toBe('CONTENT_LEVEL_FRICTION');
    expect(signal?.supportingMetrics.distinctStudents).toBe(5);
  });

  it('does NOT flag content friction when it is really just one student attempting many times', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 6; i++) {
      events.push(mkEvent('student-1', { type: 'QUESTION_STARTED', questionId: 'q-shared', sessionId: `s${i}` }));
      events.push(mkEvent('student-1', { type: 'QUESTION_SKIPPED', questionId: 'q-shared', sessionId: `s${i}` }));
    }
    expect(detectCrossStudentQuestionFriction(events, 'q-shared', NOW)).toBeNull();
  });
});
