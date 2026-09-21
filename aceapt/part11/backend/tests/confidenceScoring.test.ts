import { computeSignalConfidence } from '../src/domain/signals/confidenceScore';
import { detectConfidenceCalibrationSignal } from '../src/domain/signals/confidenceCalibration';
import { BehaviorEvent } from '../src/types/events';

describe('computeSignalConfidence', () => {
  it('returns 0 for zero evidence', () => {
    expect(computeSignalConfidence({ evidenceCount: 0, recencyDays: 0 })).toBe(0);
  });

  it('increases monotonically with evidence count, all else equal', () => {
    const low = computeSignalConfidence({ evidenceCount: 3, recencyDays: 0 });
    const mid = computeSignalConfidence({ evidenceCount: 10, recencyDays: 0 });
    const high = computeSignalConfidence({ evidenceCount: 25, recencyDays: 0 });
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });

  it('penalizes stale evidence relative to recent evidence', () => {
    const recent = computeSignalConfidence({ evidenceCount: 10, recencyDays: 1 });
    const stale = computeSignalConfidence({ evidenceCount: 10, recencyDays: 60 });
    expect(recent).toBeGreaterThan(stale);
  });

  it('never exceeds 1 or drops below 0', () => {
    expect(computeSignalConfidence({ evidenceCount: 1000, recencyDays: 0, patternConsistency: 1 })).toBeLessThanOrEqual(1);
    expect(computeSignalConfidence({ evidenceCount: 0, recencyDays: 999 })).toBeGreaterThanOrEqual(0);
  });
});

describe('detectConfidenceCalibrationSignal', () => {
  const NOW = new Date('2026-08-25T12:00:00.000Z');
  let counter = 0;
  function mkEvent(overrides: Partial<BehaviorEvent>): BehaviorEvent {
    counter += 1;
    return { id: `e-${counter}`, studentId: 'student-1', type: 'CONFIDENCE_RECORDED', occurredAtUtc: NOW.toISOString(), timezoneOffsetMinutes: 330, ...overrides };
  }

  it('returns NO_DATA explanation (never fabricated) when confidence was never captured', () => {
    const signal = detectConfidenceCalibrationSignal([], 'student-1', NOW);
    expect(signal.status).toBe('INSUFFICIENT_EVIDENCE');
    expect(signal.explanation).toMatch(/not yet in use|confidence capture/i);
  });

  it('labels OVERCONFIDENT when self-reported confidence is well above actual accuracy', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const sessionId = `s${i}`;
      const questionId = `q${i}`;
      events.push(mkEvent({ type: 'CONFIDENCE_RECORDED', sessionId, questionId, confidencePercent: 90 }));
      events.push(mkEvent({ type: 'QUESTION_ANSWERED', sessionId, questionId, correct: i < 3 })); // 30% actual accuracy
    }
    const signal = detectConfidenceCalibrationSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('OVERCONFIDENT');
  });

  it('labels CALIBRATED when confidence tracks actual accuracy closely', () => {
    const events: BehaviorEvent[] = [];
    for (let i = 0; i < 10; i++) {
      const sessionId = `s${i}`;
      const questionId = `q${i}`;
      events.push(mkEvent({ type: 'CONFIDENCE_RECORDED', sessionId, questionId, confidencePercent: 70 }));
      events.push(mkEvent({ type: 'QUESTION_ANSWERED', sessionId, questionId, correct: i < 7 })); // 70% actual accuracy
    }
    const signal = detectConfidenceCalibrationSignal(events, 'student-1', NOW);
    expect(signal.label).toBe('CALIBRATED');
  });
});
