import { detectPersistenceSignal } from '../src/domain/signals/persistence';
import { detectChallengeExposureSignal } from '../src/domain/signals/challengeEngagement';
import { BehaviorEvent } from '../src/types/events';

const NOW = new Date('2026-08-25T12:00:00.000Z');
let counter = 0;
function mkEvent(overrides: Partial<BehaviorEvent>): BehaviorEvent {
  counter += 1;
  return {
    id: `e-${counter}`,
    studentId: 'student-1',
    type: 'QUESTION_ANSWERED',
    occurredAtUtc: NOW.toISOString(),
    timezoneOffsetMinutes: 330,
    ...overrides,
  };
}

describe('detectPersistenceSignal', () => {
  it('returns INSUFFICIENT_EVIDENCE below the minimum wrong-answer count', () => {
    const events = [mkEvent({ correct: false, sessionId: 's1', questionId: 'q1' })];
    const signal = detectPersistenceSignal(events, 'student-1', NOW);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('labels STRONG when most wrong answers are followed by a retry', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 8; i++) {
      const sessionId = `s${i}`;
      const questionId = `q${i}`;
      events.push(mkEvent({ type: 'QUESTION_ANSWERED', correct: false, sessionId, questionId }));
      events.push(mkEvent({ type: 'RETRY_STARTED', sessionId, questionId }));
    }
    const signal = detectPersistenceSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('STRONG');
    expect(signal.supportingMetrics.retryRate).toBe(1);
  });

  it('labels LOW when wrong answers are rarely followed by a retry', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 8; i++) {
      events.push(mkEvent({ type: 'QUESTION_ANSWERED', correct: false, sessionId: `s${i}`, questionId: `q${i}` }));
    }
    const signal = detectPersistenceSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('LOW');
  });
});

describe('detectChallengeExposureSignal', () => {
  it('returns INSUFFICIENT_EVIDENCE below the minimum question count', () => {
    const events = [mkEvent({ difficulty: 'EASY', correct: true })];
    const signal = detectChallengeExposureSignal(events, 'student-1', NOW);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('labels LOW when almost all attempts are easy - and never treats this as a fault (severity WATCH, not NOTABLE)', () => {
    const events = Array.from({ length: 12 }, () => mkEvent({ difficulty: 'EASY', correct: true }));
    const signal = detectChallengeExposureSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('LOW');
    expect(signal.severity).toBe('WATCH');
    expect(signal.explanation.toLowerCase()).not.toContain('lazy');
    expect(signal.explanation.toLowerCase()).not.toContain('weak');
  });

  it('labels STRONG_ACCEPTANCE when most attempts are medium/hard', () => {
    const events = Array.from({ length: 12 }, (_, i) => mkEvent({ difficulty: i % 3 === 0 ? 'EASY' : 'HARD', correct: true }));
    const signal = detectChallengeExposureSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('STRONG_ACCEPTANCE');
  });
});
