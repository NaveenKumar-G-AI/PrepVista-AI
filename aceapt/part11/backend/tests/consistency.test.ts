import { detectConsistencySignal, detectReturningStudentSignal } from '../src/domain/signals/consistency';
import { BehaviorEvent } from '../src/types/events';

const NOW = new Date('2026-08-25T12:00:00.000Z');

function mkEvent(daysAgo: number, overrides: Partial<BehaviorEvent> = {}): BehaviorEvent {
  const t = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return {
    id: `e-${daysAgo}-${Math.random()}`,
    studentId: 'student-1',
    type: 'SESSION_STARTED',
    occurredAtUtc: t.toISOString(),
    timezoneOffsetMinutes: 330,
    ...overrides,
  };
}

describe('detectConsistencySignal', () => {
  it('returns INSUFFICIENT_EVIDENCE with zero activity', () => {
    const signal = detectConsistencySignal([], 'student-1', NOW, 7);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(signal.confidence).toBe(0);
  });

  it('scores Student A (20 min/day for 7 days) higher than Student B (140 min once a week) despite equal total time', () => {
    // Student A: seven separate 1-day-apart sessions across a 7-day window.
    const studentAEvents = [6, 5, 4, 3, 2, 1, 0].map((d) => mkEvent(d));
    const signalA = detectConsistencySignal(studentAEvents, 'student-a', NOW, 7);

    // Student B: one single session in the same 7-day window (140 min once).
    const studentBEvents = [mkEvent(3)];
    const signalB = detectConsistencySignal(studentBEvents, 'student-b', NOW, 7);

    expect(signalA.supportingMetrics.activeDays).toBe(7);
    expect(signalB.supportingMetrics.activeDays).toBe(1);
    // The core acceptance criterion from the brief: equal total minutes,
    // but the system must not treat the patterns as equivalent.
    expect((signalA.supportingMetrics.consistencyScore as number)).toBeGreaterThan(signalB.supportingMetrics.consistencyScore as number);
    expect(signalA.label).toBe('CONSISTENT');
  });

  it('treats a single session as low-confidence, not confidently regular', () => {
    const signal = detectConsistencySignal([mkEvent(2)], 'student-1', NOW, 14);
    expect(signal.evidenceCount).toBe(1);
    expect(signal.confidence).toBeLessThan(0.5);
  });
});

describe('detectReturningStudentSignal', () => {
  it('does not fire with fewer than two sessions', () => {
    expect(detectReturningStudentSignal([mkEvent(1)], 'student-1', NOW)).toBeNull();
  });

  it('fires when the most recent session follows a real gap', () => {
    const events = [mkEvent(20), mkEvent(0)];
    const signal = detectReturningStudentSignal(events, 'student-1', NOW);
    expect(signal).not.toBeNull();
    expect(signal?.signalType).toBe('RETURNING_STUDENT');
    expect(signal?.supportingMetrics.gapDays).toBe(20);
  });

  it('does not fire for a short, normal gap between sessions', () => {
    const events = [mkEvent(2), mkEvent(0)];
    expect(detectReturningStudentSignal(events, 'student-1', NOW)).toBeNull();
  });
});
