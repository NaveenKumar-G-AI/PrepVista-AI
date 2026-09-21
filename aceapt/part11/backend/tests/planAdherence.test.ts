import { detectPlanAdherenceSignals } from '../src/domain/signals/planAdherence';
import { BehaviorEvent } from '../src/types/events';

const NOW = new Date('2026-08-25T12:00:00.000Z');
let counter = 0;
function mkEvent(daysAgo: number, overrides: Partial<BehaviorEvent>): BehaviorEvent {
  counter += 1;
  const t = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return {
    id: `e-${counter}`,
    studentId: 'student-1',
    type: 'SESSION_COMPLETED',
    occurredAtUtc: t.toISOString(),
    timezoneOffsetMinutes: 330,
    ...overrides,
  };
}

describe('detectPlanAdherenceSignals', () => {
  it('returns INSUFFICIENT_EVIDENCE with no plan or no sessions', () => {
    const [signal] = detectPlanAdherenceSignals([], 'student-1', NOW);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
  });

  it('labels STRONG adherence when actual duration closely tracks the plan (30 planned, ~27 actual)', () => {
    const events: BehaviorEvent[] = [mkEvent(10, { type: 'PLAN_ACCEPTED', plannedSessionMinutes: 30 })];
    for (let d = 4; d >= 0; d--) {
      events.push(mkEvent(d, { type: 'SESSION_COMPLETED', durationSeconds: 27 * 60 }));
    }
    const [signal] = detectPlanAdherenceSignals(events, 'student-1', NOW);
    expect(signal.label).toBe('STRONG');
  });

  it('flags PLAN_REALISM_MISMATCH (not just LOW adherence) when a 60-min plan repeatedly gets ~20 minutes', () => {
    const events: BehaviorEvent[] = [mkEvent(10, { type: 'PLAN_ACCEPTED', plannedSessionMinutes: 60 })];
    for (let d = 5; d >= 0; d--) {
      events.push(mkEvent(d, { type: 'SESSION_COMPLETED', durationSeconds: 20 * 60 }));
    }
    const signals = detectPlanAdherenceSignals(events, 'student-1', NOW);
    const realism = signals.find((s) => s.signalType === 'PLAN_REALISM_MISMATCH');
    expect(realism).toBeDefined();
    expect(realism?.label).toBe('PLAN_MAY_BE_UNREALISTIC');
    expect(realism?.explanation.toLowerCase()).not.toContain('discipline');
    expect(realism?.explanation.toLowerCase()).not.toContain('lazy');
  });

  it('does NOT flag realism mismatch for a single off day, only a consistent shortfall', () => {
    const events: BehaviorEvent[] = [mkEvent(10, { type: 'PLAN_ACCEPTED', plannedSessionMinutes: 30 })];
    for (let d = 4; d >= 0; d--) {
      events.push(mkEvent(d, { type: 'SESSION_COMPLETED', durationSeconds: 28 * 60 }));
    }
    events.push(mkEvent(1, { type: 'SESSION_COMPLETED', durationSeconds: 5 * 60 })); // one bad day
    const signals = detectPlanAdherenceSignals(events, 'student-1', NOW);
    expect(signals.find((s) => s.signalType === 'PLAN_REALISM_MISMATCH')).toBeUndefined();
  });
});
