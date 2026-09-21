import { runAllSignalDetectors } from '../src/domain/signals';
import { buildBehaviorProfile } from '../src/domain/profileBuilder';
import { recommendPlanChange } from '../src/sample-adaptive-planner/planAdapter';
import { BehaviorEvent } from '../src/types/events';

const NOW = new Date('2026-08-25T12:00:00.000Z');
let counter = 0;
function mkEvent(daysAgo: number, overrides: Partial<BehaviorEvent>): BehaviorEvent {
  counter += 1;
  const t = new Date(NOW.getTime() - daysAgo * 86_400_000);
  return { id: `e-${counter}`, studentId: 'student-1', type: 'SESSION_STARTED', occurredAtUtc: t.toISOString(), timezoneOffsetMinutes: 330, ...overrides };
}

describe('full pipeline: events -> signals -> profile', () => {
  it('cold start: zero events produces isColdStart=true and no fabricated levels', () => {
    const signals = runAllSignalDetectors([], 'student-1', NOW);
    const profile = buildBehaviorProfile('student-1', signals, [], NOW);
    expect(profile.isColdStart).toBe(true);
    Object.values(profile.dimensions).forEach((d) => {
      expect(d.level).toBe('DEVELOPING');
      expect(d.confidence).toBe(0);
    });
  });

  it('one session only: still mostly DEVELOPING, but does not crash or fabricate confident levels', () => {
    const events: BehaviorEvent[] = [
      mkEvent(1, { type: 'SESSION_STARTED', sessionId: 's1' }),
      mkEvent(1, { type: 'QUESTION_ANSWERED', sessionId: 's1', questionId: 'q1', difficulty: 'EASY', correct: true }),
      mkEvent(1, { type: 'SESSION_COMPLETED', sessionId: 's1', durationSeconds: 600, progressFraction: 1 }),
    ];
    const signals = runAllSignalDetectors(events, 'student-1', NOW);
    const profile = buildBehaviorProfile('student-1', signals, events, NOW);
    expect(profile.isColdStart).toBe(false); // consistency has 1 data point, so not fully cold
    expect(profile.dimensions.persistence.level).toBe('DEVELOPING'); // needs wrong answers, has none
  });

  it('a full irregular-then-adapted history flows end to end into a plan-change recommendation', () => {
    const events: BehaviorEvent[] = [mkEvent(20, { type: 'PLAN_ACCEPTED', plannedSessionMinutes: 60 })];
    // Irregular, long sessions that consistently fall short of the 60-min target.
    for (const d of [18, 14, 9, 5, 2]) {
      const sessionId = `s-${d}`;
      events.push(mkEvent(d, { type: 'SESSION_STARTED', sessionId }));
      events.push(mkEvent(d, { type: 'SESSION_COMPLETED', sessionId, durationSeconds: 20 * 60, progressFraction: 1 }));
    }

    const signals = runAllSignalDetectors(events, 'student-1', NOW);
    const profile = buildBehaviorProfile('student-1', signals, events, NOW);

    expect(['LOW', 'MODERATE']).toContain(profile.dimensions.consistency.level);

    const realism = signals.find((s) => s.signalType === 'PLAN_REALISM_MISMATCH');
    expect(realism).toBeDefined();

    const recommendation = recommendPlanChange(signals, 60);
    expect(recommendation.changed).toBe(true);
    expect(recommendation.recommendedSessionMinutes).toBeLessThan(60);
    expect(recommendation.reasons.length).toBeGreaterThan(0);
    expect(recommendation.triggeredBySignalIds.length).toBeGreaterThan(0);
  });

  it('every ACTIVE signal in a rich history carries non-empty evidence and a traceable confidence', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 15; i++) {
      const d = 14 - i;
      const sessionId = `s-${i}`;
      events.push(mkEvent(d, { type: 'SESSION_STARTED', sessionId }));
      events.push(mkEvent(d, { type: 'QUESTION_ANSWERED', sessionId, questionId: `q${i}`, difficulty: i % 2 === 0 ? 'HARD' : 'EASY', correct: i % 3 !== 0 }));
      events.push(mkEvent(d, { type: 'SESSION_COMPLETED', sessionId, durationSeconds: 25 * 60, progressFraction: 1 }));
    }
    const signals = runAllSignalDetectors(events, 'student-1', NOW);
    signals
      .filter((s) => s.status === 'ACTIVE')
      .forEach((s) => {
        expect(s.evidenceCount).toBeGreaterThan(0);
        expect(s.confidence).toBeGreaterThanOrEqual(0);
        expect(s.confidence).toBeLessThanOrEqual(1);
        expect(s.explanation.length).toBeGreaterThan(0);
      });
  });
});
