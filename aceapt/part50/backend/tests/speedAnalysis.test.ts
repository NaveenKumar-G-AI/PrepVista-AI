import {
  classifySpeedState,
  computeBaseline,
  groupByScope,
  resolveExpectedTime,
  splitByIndependence,
} from '../src/core/speedAnalysis';
import { NewSpeedAttempt, ScopeKey, SpeedAttemptRecord, SpeedPerformanceState } from '../src/types/domain';

let counter = 0;
function makeAttempt(overrides: Partial<SpeedAttemptRecord> = {}): SpeedAttemptRecord {
  counter += 1;
  const base: NewSpeedAttempt = {
    sessionId: 's1',
    studentId: 'student-1',
    question: { questionId: `q${counter}`, skillId: 'percentages', difficulty: 'MEDIUM' },
    responseTimeMs: 50000,
    correct: true,
    independent: true,
    hintLevel: 0,
    clientAttemptId: `client-${counter}`,
  };
  return {
    ...base,
    id: `attempt-${counter}`,
    expectedTimeMs: null,
    expectedTimeSource: 'UNKNOWN',
    relativeSpeed: null,
    performanceState: SpeedPerformanceState.INSUFFICIENT_DATA,
    createdAt: new Date(),
    ...overrides,
  };
}

const scope: ScopeKey = { scopeType: 'SKILL', scopeId: 'percentages' };

describe('classifySpeedState', () => {
  it('returns INSUFFICIENT_DATA when there is no expected time (never fabricates one)', () => {
    const result = classifySpeedState(45000, null, true);
    expect(result.state).toBe(SpeedPerformanceState.INSUFFICIENT_DATA);
    expect(result.relativeSpeed).toBeNull();
  });

  it('classifies fast + correct as FAST_ACCURATE', () => {
    const result = classifySpeedState(40000, 60000, true); // ratio 0.667
    expect(result.state).toBe(SpeedPerformanceState.FAST_ACCURATE);
  });

  it('classifies fast + incorrect as FAST_INACCURATE (rushing evidence)', () => {
    const result = classifySpeedState(25000, 60000, false); // ratio 0.417
    expect(result.state).toBe(SpeedPerformanceState.FAST_INACCURATE);
  });

  it('classifies slow + correct as SLOW_ACCURATE', () => {
    const result = classifySpeedState(90000, 60000, true); // ratio 1.5
    expect(result.state).toBe(SpeedPerformanceState.SLOW_ACCURATE);
  });

  it('classifies slow + incorrect as SLOW_INACCURATE', () => {
    const result = classifySpeedState(100000, 60000, false);
    expect(result.state).toBe(SpeedPerformanceState.SLOW_INACCURATE);
  });

  it('classifies a time close to expected as ON_PACE, not forced into fast/slow', () => {
    const result = classifySpeedState(62000, 60000, true); // ratio 1.033
    expect(result.state).toBe(SpeedPerformanceState.ON_PACE_ACCURATE);
  });
});

describe('computeBaseline', () => {
  it('returns null below the minimum sample size (never a guessed baseline)', () => {
    const attempts = [makeAttempt(), makeAttempt()];
    expect(computeBaseline(scope, attempts)).toBeNull();
  });

  it('computes average/median/accuracy once there is enough evidence', () => {
    const attempts = [40000, 50000, 60000, 55000, 45000].map((t) => makeAttempt({ responseTimeMs: t, correct: true }));
    const baseline = computeBaseline(scope, attempts);
    expect(baseline).not.toBeNull();
    expect(baseline!.sampleSize).toBe(5);
    expect(baseline!.averageMs).toBe(50000);
    expect(baseline!.accuracy).toBe(1);
  });

  it('excludes hint-assisted attempts by default (spec 45, 116-117)', () => {
    const independent = [40000, 42000, 44000].map((t) => makeAttempt({ responseTimeMs: t, independent: true, hintLevel: 0 }));
    const assisted = [10000, 12000].map((t) => makeAttempt({ responseTimeMs: t, independent: false, hintLevel: 3 }));
    const baseline = computeBaseline(scope, [...independent, ...assisted]);
    expect(baseline!.sampleSize).toBe(3);
    expect(baseline!.averageMs).toBe(42000);
  });

  it('scopes by novelty tier so familiar speed is never mixed with novel speed (spec 104, 135)', () => {
    const familiar = [20000, 22000, 21000].map((t) => makeAttempt({ responseTimeMs: t, noveltyLevel: 'FAMILIAR' }));
    const novel = [50000, 52000, 48000].map((t) => makeAttempt({ responseTimeMs: t, noveltyLevel: 'NOVEL' }));
    const familiarBaseline = computeBaseline(scope, [...familiar, ...novel], { novelty: 'FAMILIAR' });
    const novelBaseline = computeBaseline(scope, [...familiar, ...novel], { novelty: 'NOVEL' });
    expect(familiarBaseline!.averageMs).toBeLessThan(novelBaseline!.averageMs);
  });
});

describe('resolveExpectedTime', () => {
  it('prefers calibrated data over a personal baseline', () => {
    const result = resolveExpectedTime({
      calibratedExpectedTimeMs: 55000,
      personalBaseline: { scope, sampleSize: 20, averageMs: 70000, medianMs: 68000, accuracy: 0.9, confidence: 'HIGH', updatedAt: new Date() },
    });
    expect(result).toEqual({ expectedTimeMs: 55000, source: 'CALIBRATED' });
  });

  it('falls back to the personal baseline when there is no calibrated data', () => {
    const result = resolveExpectedTime({
      calibratedExpectedTimeMs: null,
      personalBaseline: { scope, sampleSize: 10, averageMs: 58000, medianMs: 57000, accuracy: 0.93, confidence: 'MEDIUM', updatedAt: new Date() },
    });
    expect(result).toEqual({ expectedTimeMs: 58000, source: 'PERSONAL_BASELINE' });
  });

  it('returns UNKNOWN rather than fabricating a number when neither source has enough evidence', () => {
    const result = resolveExpectedTime({ calibratedExpectedTimeMs: null, personalBaseline: null });
    expect(result).toEqual({ expectedTimeMs: null, source: 'UNKNOWN' });
  });
});

describe('groupByScope (difficulty fairness, spec 102, 138)', () => {
  it('never groups an Easy attempt together with a Hard attempt', () => {
    const easy = makeAttempt({ question: { questionId: 'e1', skillId: 'percentages', difficulty: 'EASY' }, responseTimeMs: 25000 });
    const hard = makeAttempt({ question: { questionId: 'h1', skillId: 'percentages', difficulty: 'HARD' }, responseTimeMs: 90000 });
    const groups = groupByScope([easy, hard]);
    expect(groups.size).toBe(2);
    expect(groups.get('SKILL:percentages:EASY')).toHaveLength(1);
    expect(groups.get('SKILL:percentages:HARD')).toHaveLength(1);
  });
});

describe('splitByIndependence (spec 136)', () => {
  it('separates hint-assisted attempts from independent ones', () => {
    const independent = makeAttempt({ independent: true, hintLevel: 0 });
    const assisted = makeAttempt({ independent: true, hintLevel: 2 });
    const result = splitByIndependence([independent, assisted]);
    expect(result.independent).toEqual([independent]);
    expect(result.assisted).toEqual([assisted]);
  });
});
