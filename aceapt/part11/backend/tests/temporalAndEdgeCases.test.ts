import { detectCrammingSignal, detectLearningRhythmSignal } from '../src/domain/signals/temporalPatterns';
import { localDateKey, withinWindow } from '../src/domain/time';
import { InMemoryEventStore } from '../src/infrastructure/inMemoryEventStore';
import { BehaviorEvent } from '../src/types/events';

const NOW = new Date('2026-08-25T12:00:00.000Z');
let counter = 0;
function mkEvent(daysAgo: number, overrides: Partial<BehaviorEvent>): BehaviorEvent {
  counter += 1;
  const t = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return { id: `e-${counter}`, studentId: 'student-1', type: 'SESSION_COMPLETED', occurredAtUtc: t.toISOString(), timezoneOffsetMinutes: 330, ...overrides };
}

describe('detectCrammingSignal', () => {
  it('detects several low-activity days followed by a disproportionate spike', () => {
    const events: BehaviorEvent[] = [];
    // 5 low-activity days (a few minutes each)
    for (const d of [8, 7, 6, 5, 4]) events.push(mkEvent(d, { durationSeconds: 3 * 60 }));
    // then a big spike
    events.push(mkEvent(3, { durationSeconds: 150 * 60 }));
    const signal = detectCrammingSignal(events, 'student-1', NOW);
    expect(signal).not.toBeNull();
    expect(signal?.label).toBe('CRAMMING_DETECTED');
  });

  it('does not flag a single long session with no preceding low-activity stretch', () => {
    const events: BehaviorEvent[] = [mkEvent(1, { durationSeconds: 90 * 60 })];
    expect(detectCrammingSignal(events, 'student-1', NOW)).toBeNull();
  });

  it('returns null with no duration data at all', () => {
    expect(detectCrammingSignal([], 'student-1', NOW)).toBeNull();
  });
});

describe('detectLearningRhythmSignal', () => {
  it('identifies the best-performing session-length bucket when there is a clear accuracy edge', () => {
    const events: BehaviorEvent[] = [];
    // Short sessions (~20 min): high accuracy
    for (let i = 0; i < 4; i++) {
      const sessionId = `short-${i}`;
      events.push(mkEvent(i, { type: 'SESSION_COMPLETED', sessionId, durationSeconds: 20 * 60 }));
      for (let q = 0; q < 5; q++) events.push(mkEvent(i, { type: 'QUESTION_ANSWERED', sessionId, correct: true }));
    }
    // Long sessions (~50 min): lower accuracy
    for (let i = 0; i < 4; i++) {
      const sessionId = `long-${i}`;
      events.push(mkEvent(i + 10, { type: 'SESSION_COMPLETED', sessionId, durationSeconds: 50 * 60 }));
      for (let q = 0; q < 5; q++) events.push(mkEvent(i + 10, { type: 'QUESTION_ANSWERED', sessionId, correct: q < 2 }));
    }
    const signal = detectLearningRhythmSignal(events, 'student-1', NOW);
    expect(signal.status).toBe('ACTIVE');
    expect(signal.label).toContain('15-30');
  });

  it('returns INSUFFICIENT_EVIDENCE when bucket accuracy differences are not meaningful', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 4; i++) {
      const sessionId = `s-${i}`;
      events.push(mkEvent(i, { type: 'SESSION_COMPLETED', sessionId, durationSeconds: 25 * 60 }));
      for (let q = 0; q < 5; q++) events.push(mkEvent(i, { type: 'QUESTION_ANSWERED', sessionId, correct: q < 3 }));
    }
    const signal = detectLearningRhythmSignal(events, 'student-1', NOW);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
  });
});

describe('timezone boundary handling', () => {
  it('assigns events near local midnight to the correct local calendar day for IST (+330)', () => {
    // 2026-08-24T19:00:00Z + 330 min = 2026-08-25T00:30 local -> should be the 25th locally, not the 24th.
    const key = localDateKey({ occurredAtUtc: '2026-08-24T19:00:00.000Z', timezoneOffsetMinutes: 330 });
    expect(key).toBe('2026-08-25');
  });

  it('assigns events for a negative (western) offset correctly', () => {
    // 2026-08-25T02:00:00Z - 5h (PET, -300) = 2026-08-24T21:00 local -> should be the 24th locally.
    const key = localDateKey({ occurredAtUtc: '2026-08-25T02:00:00.000Z', timezoneOffsetMinutes: -300 });
    expect(key).toBe('2026-08-24');
  });
});

describe('InMemoryEventStore edge cases', () => {
  it('is idempotent when the same event id is appended twice (delayed/duplicate delivery)', async () => {
    const store = new InMemoryEventStore();
    const event = mkEvent(0, { id: 'fixed-id', type: 'SESSION_STARTED' });
    await store.append(event);
    await store.append(event);
    const results = await store.query({ studentId: 'student-1' });
    expect(results.length).toBe(1);
  });

  it('returns an empty array for a student with zero events', async () => {
    const store = new InMemoryEventStore();
    expect(await store.query({ studentId: 'nobody' })).toEqual([]);
  });
});

describe('withinWindow upper bound (regression)', () => {
  it('excludes events that occur after `now`, so a past-cutoff snapshot never sees the future', () => {
    const past = mkEvent(5, {});
    const future: BehaviorEvent = { ...mkEvent(0, {}), occurredAtUtc: new Date(NOW.getTime() + 10 * 86_400_000).toISOString() };
    const result = withinWindow([past, future], NOW, 14);
    expect(result).toEqual([past]);
  });
});
