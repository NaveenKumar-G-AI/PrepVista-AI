import { assessBottlenecks, detectHesitation, detectKnowledgeGap, detectRushing, detectStageBottleneck, detectTimeWasting, topBottleneck } from '../src/core/bottleneckEngine';
import { BottleneckType, NewSpeedAttempt, ScopeKey, SpeedAttemptRecord, SpeedBaseline, SpeedPerformanceState } from '../src/types/domain';

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
    performanceState: SpeedPerformanceState.ON_PACE_ACCURATE,
    createdAt: new Date(),
    ...overrides,
  };
}

const scope: ScopeKey = { scopeType: 'SKILL', scopeId: 'percentages' };
const baseline: SpeedBaseline = { scope, sampleSize: 20, averageMs: 55000, medianMs: 54000, accuracy: 0.9, confidence: 'HIGH', updatedAt: new Date() };

describe('detectStageBottleneck (spec 133-134, 137)', () => {
  it('identifies STRATEGY as the bottleneck when strategy time is high but calculation is normal', () => {
    const attempts = Array.from({ length: 4 }, () =>
      makeAttempt({ stage: { readingMs: 5000, strategyMs: 40000, calculationMs: 10000, verificationMs: 3000 } }),
    );
    const result = detectStageBottleneck(attempts, scope, { readingMs: 5000, strategyMs: 15000, calculationMs: 10000, verificationMs: 3000 });
    expect(result.type).toBe(BottleneckType.STRATEGY);
  });

  it('identifies CALCULATION as the bottleneck when strategy is fast but calculation is high', () => {
    const attempts = Array.from({ length: 4 }, () =>
      makeAttempt({ stage: { readingMs: 5000, strategyMs: 8000, calculationMs: 45000, verificationMs: 3000 } }),
    );
    const result = detectStageBottleneck(attempts, scope, { readingMs: 5000, strategyMs: 10000, calculationMs: 15000, verificationMs: 3000 });
    expect(result.type).toBe(BottleneckType.CALCULATION);
  });

  it('returns UNKNOWN with low confidence when there is no stage instrumentation', () => {
    const attempts = [makeAttempt(), makeAttempt()];
    const result = detectStageBottleneck(attempts, scope, {});
    expect(result.type).toBe(BottleneckType.UNKNOWN);
    expect(result.confidence).toBe('LOW');
  });
});

describe('detectRushing (spec 25, 131)', () => {
  it('fires when several recent responses are both unusually fast and incorrect', () => {
    const attempts = [20000, 22000, 21000, 55000].map((t, i) => makeAttempt({ responseTimeMs: t, correct: i === 3 }));
    const result = detectRushing(attempts, baseline, scope);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(BottleneckType.RUSHING);
  });

  it('does not fire when fast responses stay accurate', () => {
    const attempts = [20000, 22000, 21000, 23000].map((t) => makeAttempt({ responseTimeMs: t, correct: true }));
    expect(detectRushing(attempts, baseline, scope)).toBeNull();
  });
});

describe('detectHesitation (spec 24, 132)', () => {
  it('fires when responses are consistently slower than baseline but correct', () => {
    const attempts = [80000, 85000, 82000, 90000].map((t) => makeAttempt({ responseTimeMs: t, correct: true }));
    const result = detectHesitation(attempts, baseline, scope);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(BottleneckType.HESITATION);
  });

  it('gains confidence when low self-reported confidence accompanies correct-but-slow answers', () => {
    const attempts = [80000, 85000, 82000].map((t) => makeAttempt({ responseTimeMs: t, correct: true, confidenceRating: 2 }));
    const result = detectHesitation(attempts, baseline, scope);
    expect(result!.confidence).toBe('MEDIUM');
  });
});

describe('detectKnowledgeGap (spec 42-43, 57, 108)', () => {
  it('fires on low accuracy that is not explained by rushing', () => {
    const attempts = [95000, 100000, 90000, 98000, 92000].map((t, i) => makeAttempt({ responseTimeMs: t, correct: i < 2 }));
    const result = detectKnowledgeGap(attempts, baseline, 0.85, scope);
    expect(result).not.toBeNull();
    expect(result!.type).toBe(BottleneckType.KNOWLEDGE_GAP);
  });

  it('does not fire when low accuracy is actually explained by rushing (that is RUSHING, not KNOWLEDGE_GAP)', () => {
    const attempts = [15000, 16000, 14000, 17000, 15000].map((t) => makeAttempt({ responseTimeMs: t, correct: false }));
    expect(detectKnowledgeGap(attempts, baseline, 0.85, scope)).toBeNull();
  });
});

describe('detectTimeWasting (spec 26)', () => {
  it('only fires when retry/idle instrumentation is actually present', () => {
    const noSignal = [makeAttempt(), makeAttempt(), makeAttempt()];
    expect(detectTimeWasting(noSignal, scope)).toBeNull();

    const withSignal = [
      makeAttempt({ retryCount: 3 }),
      makeAttempt({ retryCount: 2 }),
      makeAttempt({ idleMs: 20000 }),
    ];
    expect(detectTimeWasting(withSignal, scope)).not.toBeNull();
  });
});

describe('assessBottlenecks + topBottleneck', () => {
  it('never returns an empty list - falls back to UNKNOWN with low confidence', () => {
    const results = assessBottlenecks({ recent: [makeAttempt(), makeAttempt()], baseline: null, guardrail: 0.85, scope });
    expect(results.length).toBeGreaterThan(0);
    expect(topBottleneck(results).type).toBe(BottleneckType.UNKNOWN);
  });

  it('ranks the highest-confidence assessment first', () => {
    const rushingAttempts = [15000, 16000, 14000, 17000].map((t) => makeAttempt({ responseTimeMs: t, correct: false }));
    const results = assessBottlenecks({ recent: rushingAttempts, baseline, guardrail: 0.85, scope });
    const top = topBottleneck(results);
    expect(['RUSHING', 'KNOWLEDGE_GAP']).toContain(top.type);
  });
});
