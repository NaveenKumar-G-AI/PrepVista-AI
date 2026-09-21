// Implements the spec's own "CORE TEST - SPEED VS ACCURACY" (section 128)
// end-to-end through the real classify -> baseline -> policy pipeline, plus
// the novelty-fairness case (135) and a tone-safety scan (73) across every
// message the engine can produce.

import { classifySpeedState, computeBaseline } from '../src/core/speedAnalysis';
import { evaluateTrainingPolicy, TrainingPolicyContext } from '../src/core/trainingPolicy';
import { containsBannedPhrase, perAttemptFeedback, sessionSummary } from '../src/core/feedbackMessages';
import { BottleneckType, NewSpeedAttempt, ScopeKey, SpeedAttemptRecord, TrainingMode } from '../src/types/domain';

const scope: ScopeKey = { scopeType: 'SKILL', scopeId: 'percentages' };

let counter = 0;
function buildScenario(avgSeconds: number, accuracy: number, expectedSeconds: number, count = 10): SpeedAttemptRecord[] {
  const correctCount = Math.round(count * accuracy);
  const attempts: SpeedAttemptRecord[] = [];
  for (let i = 0; i < count; i += 1) {
    counter += 1;
    const correct = i < correctCount;
    // small jitter so times aren't perfectly identical, centered on avgSeconds
    const jitterMs = ((i % 3) - 1) * 1000;
    const responseTimeMs = avgSeconds * 1000 + jitterMs;
    const expectedTimeMs = expectedSeconds * 1000;
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
    attempts.push({ ...base, id: `attempt-${counter}`, expectedTimeMs, expectedTimeSource: 'PERSONAL_BASELINE', relativeSpeed, performanceState: state, createdAt: new Date() });
  }
  return attempts;
}

function policyFor(attempts: SpeedAttemptRecord[], expectedSeconds: number) {
  const baseline = computeBaseline(scope, attempts);
  const ctx: TrainingPolicyContext = {
    recentAttempts: attempts,
    sessionAttempts: attempts,
    baseline,
    guardrailAccuracy: 0.85,
    currentTargetMs: expectedSeconds * 1000,
    currentMode: TrainingMode.BALANCED,
  };
  return evaluateTrainingPolicy(ctx);
}

describe('Spec 128 - CORE TEST: speed vs accuracy', () => {
  it('Case A: 40s @ 95% accuracy (expected ~55s) reads as positive speed evidence', () => {
    const attempts = buildScenario(40, 0.95, 55);
    const decision = policyFor(attempts, 55);
    expect(decision.signal).toBe('STABLE_IMPROVING');
    expect(decision.pressureAction).toBe('INCREASE');
  });

  it('Case B: 25s @ 68% accuracy reads as a rushing signal', () => {
    const attempts = buildScenario(25, 0.68, 55);
    const decision = policyFor(attempts, 55);
    expect(decision.signal).toBe(BottleneckType.RUSHING);
  });

  it('Case C: 80s @ 95% accuracy (expected ~55s) reads as a fluency opportunity / possible hesitation', () => {
    const attempts = buildScenario(80, 0.95, 55);
    const decision = policyFor(attempts, 55);
    expect(decision.signal).toBe(BottleneckType.HESITATION);
    expect(decision.pressureAction).not.toBe('DECREASE'); // hesitation holds pressure, doesn't punish
  });

  it('Case D: 100s @ 60% accuracy calls for knowledge/strategy investigation, not aggressive speed training', () => {
    const attempts = buildScenario(100, 0.6, 55);
    const decision = policyFor(attempts, 55);
    expect(decision.signal).toBe(BottleneckType.KNOWLEDGE_GAP);
    expect(decision.pressureAction).toBe('DECREASE');
  });
});

describe('Spec 135 - novelty fairness', () => {
  it('does not treat a slower-but-accurate NOVEL attempt as an automatic regression', () => {
    const familiar = buildScenario(20, 1, 22).map((a) => ({ ...a, noveltyLevel: 'FAMILIAR' as const }));
    const novel = buildScenario(45, 1, 22, 4).map((a) => ({ ...a, noveltyLevel: 'NOVEL' as const }));

    const familiarBaseline = computeBaseline(scope, familiar, { novelty: 'FAMILIAR' });
    const novelDecision = evaluateTrainingPolicy({
      recentAttempts: novel,
      sessionAttempts: novel,
      baseline: familiarBaseline, // deliberately compared against the FAMILIAR baseline, worst case
      guardrailAccuracy: 0.85,
      currentTargetMs: 22000,
      currentMode: TrainingMode.BALANCED,
    });
    // Slower + fully accurate should read as hesitation/holding, never as a
    // punitive "regression" (rushing/knowledge-gap) signal.
    expect(novelDecision.signal).not.toBe(BottleneckType.RUSHING);
    expect(novelDecision.signal).not.toBe(BottleneckType.KNOWLEDGE_GAP);
  });
});

describe('Spec 73 - tone safety', () => {
  it('never produces a banned phrase across the full range of feedback and policy messages', () => {
    const messages: string[] = [];

    const scenarios: Array<[number, number, number]> = [
      [40, 0.95, 55],
      [25, 0.68, 55],
      [80, 0.95, 55],
      [100, 0.6, 55],
    ];
    for (const [avg, acc, expected] of scenarios) {
      const attempts = buildScenario(avg, acc, expected);
      messages.push(policyFor(attempts, expected).message);
      for (const attempt of attempts.slice(0, 3)) {
        messages.push(perAttemptFeedback(attempt, 0.85, acc).status);
        messages.push(perAttemptFeedback(attempt, 0.85, acc).detail);
      }
    }

    const summary = sessionSummary({ avgMs: 58000, accuracy: 0.93 }, { avgMs: 38000, accuracy: 0.72 }, 'Strategy selection', 'Accuracy dropped at higher speed.', 'Balanced practice next.');
    messages.push(summary.headline, summary.mainImprovement ?? '', summary.mainCaution ?? '', summary.nextFocus);

    for (const message of messages) {
      expect(containsBannedPhrase(message)).toBe(false);
    }
  });
});
