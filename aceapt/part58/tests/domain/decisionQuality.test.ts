import { describe, expect, it } from 'vitest';
import { assessOutcome, assessProcessQuality, explainDecision, type DecisionQualityInput } from '../../src/domain/decisionQuality';

function baseInput(overrides: Partial<DecisionQualityInput> = {}): DecisionQualityInput {
  return {
    action: 'ELIMINATE',
    uncertaintyState: 'UNCERTAIN',
    evidenceUsed: [{ type: 'OPTION_ELIMINATED_UNIT', level: 'SELF_REPORTED', optionId: 'B' }],
    totalOptions: 4,
    eliminatedOptionIds: ['B'],
    elapsedTimeSeconds: 40,
    questionExpectedTimeSeconds: 45,
    remainingTestTimeSeconds: 600,
    policy: null,
    confidenceBand: 'MEDIUM',
    ...overrides,
  };
}

describe('assessProcessQuality — no hindsight bias', () => {
  it('produces an identical process-quality profile regardless of eventual outcome (§62, §170-171)', () => {
    const input = baseInput();
    const quality = assessProcessQuality(input);

    // The type system already makes this the only possible outcome (there is
    // no `isCorrect` field on DecisionQualityInput at all), but we also assert
    // it behaviourally: calling it twice with the same decision-time input
    // must be deterministic and cannot vary with a later-known outcome.
    expect(assessProcessQuality(input)).toEqual(quality);
  });

  it('never claims risk awareness when the scoring policy is unknown (§121)', () => {
    const quality = assessProcessQuality(baseInput({ policy: null }));
    expect(quality.riskAwareness).toBe('NOT_ASSESSABLE');
  });

  it('rates a blind guess under real negative marking as low risk awareness', () => {
    const quality = assessProcessQuality(
      baseInput({
        action: 'BLIND_GUESS',
        evidenceUsed: [],
        eliminatedOptionIds: [],
        policy: {
          id: 'p1',
          tenantId: 't1',
          assessmentVersionId: 'v1',
          correctReward: 1,
          wrongPenalty: 0.25,
          blankValue: 0,
          navigationRules: { canSkip: true, canReturnLater: true, canChangeAnswer: true },
          strategyAssistance: 'NONE',
          source: 'VERIFIED',
          version: 1,
          effectiveFrom: new Date().toISOString(),
        },
      })
    );
    expect(quality.riskAwareness).toBe('LOW');
  });

  it('treats a decision with zero recorded evidence as LOW evidence use unless it is a skip', () => {
    const skipQuality = assessProcessQuality(baseInput({ action: 'SKIP', evidenceUsed: [], eliminatedOptionIds: [] }));
    expect(skipQuality.evidenceUsed).toBe('NOT_ASSESSABLE');

    const guessQuality = assessProcessQuality(baseInput({ action: 'BLIND_GUESS', evidenceUsed: [], eliminatedOptionIds: [] }));
    expect(guessQuality.evidenceUsed).toBe('LOW');
  });

  it('does not fabricate confidence-calibration quality from a single decision (§205)', () => {
    const quality = assessProcessQuality(baseInput({ comparableCalibration: null }));
    expect(quality.confidenceCalibration).toBe('NOT_ASSESSABLE');
  });
});

describe('assessOutcome / explainDecision', () => {
  it('keeps outcome and process description as separate clauses', () => {
    const input = baseInput();
    const outcome = assessOutcome(false);
    const explanation = explainDecision(input, outcome);
    expect(explanation).toMatch(/incorrect/);
    expect(explanation.toLowerCase()).not.toMatch(/should have known/);
  });

  it('reports an ungraded outcome honestly rather than guessing', () => {
    const explanation = explainDecision(baseInput(), assessOutcome(null));
    expect(explanation).toMatch(/not graded yet/);
  });
});
