import { evaluateTrainingPolicy, TrainingPolicyContext } from '../src/core/trainingPolicy';
import { BottleneckType, NewSpeedAttempt, ScopeKey, SpeedAttemptRecord, SpeedBaseline, SpeedPerformanceState, TrainingMode } from '../src/types/domain';
import { classifySpeedState } from '../src/core/speedAnalysis';

let counter = 0;
function makeAttempt(responseTimeMs: number, correct: boolean, expectedTimeMs: number): SpeedAttemptRecord {
  counter += 1;
  const { relativeSpeed, state } = classifySpeedState(responseTimeMs, expectedTimeMs, correct);
  const base: NewSpeedAttempt = {
    sessionId: 's1',
    studentId: 'student-1',
    question: { questionId: `q${counter}`, skillId: 'percentages', difficulty: 'MEDIUM' },
    responseTimeMs,
    correct,
    independent: true,
    hintLevel: 0,
    clientAttemptId: `client-${counter}`,
  };
  return { ...base, id: `attempt-${counter}`, expectedTimeMs, expectedTimeSource: 'PERSONAL_BASELINE', relativeSpeed, performanceState: state, createdAt: new Date() };
}

const scope: ScopeKey = { scopeType: 'SKILL', scopeId: 'percentages' };
const baseline: SpeedBaseline = { scope, sampleSize: 20, averageMs: 60000, medianMs: 60000, accuracy: 0.9, confidence: 'HIGH', updatedAt: new Date() };

function baseCtx(overrides: Partial<TrainingPolicyContext> = {}): TrainingPolicyContext {
  return {
    recentAttempts: [],
    sessionAttempts: [],
    baseline,
    guardrailAccuracy: 0.85,
    currentTargetMs: 60000,
    currentMode: TrainingMode.BALANCED,
    ...overrides,
  };
}

describe('evaluateTrainingPolicy - insufficient data', () => {
  it('holds when there are fewer than 3 attempts', () => {
    const attempts = [makeAttempt(50000, true, 60000), makeAttempt(48000, true, 60000)];
    const decision = evaluateTrainingPolicy(baseCtx({ recentAttempts: attempts, sessionAttempts: attempts }));
    expect(decision.signal).toBe('INSUFFICIENT_DATA');
    expect(decision.pressureAction).toBe('HOLD');
  });
});

describe('evaluateTrainingPolicy - adaptive ramp (spec 129)', () => {
  it('ramps the target down step by step, never in one jump, as accuracy stays stable', () => {
    let target = 60000;
    const targets: number[] = [target];
    for (let round = 0; round < 4; round += 1) {
      const attempts = [target - 2000, target - 3000, target - 2500].map((t) => makeAttempt(t, true, target));
      const decision = evaluateTrainingPolicy(
        baseCtx({ recentAttempts: attempts, sessionAttempts: attempts, currentTargetMs: target }),
      );
      expect(decision.signal).toBe('STABLE_IMPROVING');
      expect(decision.pressureAction).toBe('INCREASE');
      target = decision.nextTargetMs!;
      targets.push(target);
    }
    // Monotonically decreasing...
    for (let i = 1; i < targets.length; i += 1) {
      expect(targets[i]).toBeLessThan(targets[i - 1]);
    }
    // ...but never by more than ~10% in a single step (a "jump").
    for (let i = 1; i < targets.length; i += 1) {
      expect(targets[i]).toBeGreaterThan(targets[i - 1] * 0.9);
    }
    // ...and never below the safety floor relative to the true baseline.
    expect(target).toBeGreaterThanOrEqual(baseline.averageMs * 0.65 - 1);
  });
});

describe('evaluateTrainingPolicy - accuracy collapse (spec 130)', () => {
  it('reduces pressure and switches to BALANCED when speed gains come with an accuracy collapse', () => {
    // 55s -> 35s, 94% -> 74%: fast responses, mostly incorrect.
    const attempts = [35000, 34000, 36000, 33000, 35000].map((t, i) => makeAttempt(t, i < 1, 55000));
    const decision = evaluateTrainingPolicy(baseCtx({ recentAttempts: attempts, sessionAttempts: attempts, currentTargetMs: 55000 }));
    expect(decision.signal).toBe(BottleneckType.RUSHING);
    expect(decision.pressureAction).toBe('DECREASE');
    expect(decision.nextMode).toBe(TrainingMode.BALANCED);
  });
});

describe('evaluateTrainingPolicy - fatigue (spec 114, 139)', () => {
  it('flags a late-session slow-down as possible fatigue rather than a skill regression', () => {
    const early = [50000, 48000, 52000, 49000].map((t) => makeAttempt(t, true, 55000));
    const late = [70000, 75000, 72000].map((t, i) => makeAttempt(t, i !== 0, 55000)); // slower + one miss
    const session = [...early, ...late];
    const decision = evaluateTrainingPolicy(baseCtx({ recentAttempts: session, sessionAttempts: session, currentTargetMs: 55000 }));
    expect(decision.signal).not.toBe(BottleneckType.KNOWLEDGE_GAP);
    expect(decision.message.toLowerCase()).toContain('fatigue');
  });
});

describe('evaluateTrainingPolicy - hesitation (spec 132)', () => {
  it('recommends DECISION mode, not more pressure, when slow but accurate', () => {
    const attempts = [90000, 92000, 88000, 95000].map((t) => makeAttempt(t, true, 60000));
    const decision = evaluateTrainingPolicy(baseCtx({ recentAttempts: attempts, sessionAttempts: attempts }));
    expect(decision.signal).toBe(BottleneckType.HESITATION);
    expect(decision.nextMode).toBe(TrainingMode.DECISION);
    expect(decision.pressureAction).toBe('HOLD');
  });
});
