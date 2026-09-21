import { describe, expect, it } from "vitest";
import { decideNextDifficulty } from "../src/engines/difficultyEngine";
import { Difficulty, DifficultyDimension, ErrorCategory, RelativeSpeed } from "../src/domain/enums";
import { Attempt } from "../src/domain/types";

function makeAttempt(overrides: Partial<Attempt>): Attempt {
  return {
    id: "a1",
    studentId: "s1",
    sessionId: "sess1",
    questionId: "q1",
    skillId: "SK_TEST",
    selectedOptionId: "opt1",
    isCorrect: true,
    timeToStartMs: 500,
    totalTimeMs: 20_000,
    expectedTimeMs: 40_000,
    relativeSpeed: RelativeSpeed.FAST,
    hintsUsed: 0,
    confidence: null,
    errorCategory: null,
    performanceInterpretation: null,
    difficultyAtAttempt: { level: Difficulty.MEDIUM, conceptComplexity: 3, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 3, transferDifficulty: 2 },
    questionIndexInSession: 1,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("difficultyEngine", () => {
  it("§10 worked example: Medium(correct,fast) -> Medium+(correct,fast) -> Hard(wrong,calc) lands on Medium+ with a calculation focus, NOT Easy", () => {
    // Step 1: Medium, correct, fast.
    const step1 = decideNextDifficulty(Difficulty.MEDIUM, makeAttempt({ isCorrect: true, relativeSpeed: RelativeSpeed.FAST }), []);
    expect(step1.nextDifficulty).toBe(Difficulty.MEDIUM_PLUS);

    // Step 2: Medium+, correct, fast (one prior fast-correct in history).
    const priorFastCorrect = makeAttempt({ isCorrect: true, relativeSpeed: RelativeSpeed.FAST });
    const step2 = decideNextDifficulty(
      Difficulty.MEDIUM_PLUS,
      makeAttempt({ isCorrect: true, relativeSpeed: RelativeSpeed.FAST }),
      [priorFastCorrect]
    );
    expect(step2.nextDifficulty).toBe(Difficulty.HARD);

    // Step 3: Hard, WRONG due to a calculation error.
    const history = [priorFastCorrect, makeAttempt({ isCorrect: true, relativeSpeed: RelativeSpeed.FAST })];
    const step3 = decideNextDifficulty(
      Difficulty.HARD,
      makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CALCULATION_ERROR, relativeSpeed: RelativeSpeed.ON_PACE }),
      history
    );

    expect(step3.nextDifficulty).toBe(Difficulty.MEDIUM_PLUS); // eased ONE tier, not crashed to Easy
    expect(step3.nextDifficulty).not.toBe(Difficulty.EASY);
    expect(step3.focusDimension).toBe(DifficultyDimension.CALCULATION);
    expect(step3.triggeredAdaptation).toBe(true);
  });

  it("a CONCEPT_GAP miss steps back further than a calculation error at the same level", () => {
    const calcMiss = decideNextDifficulty(Difficulty.HARD, makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CALCULATION_ERROR }), []);
    const conceptMiss = decideNextDifficulty(Difficulty.HARD, makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CONCEPT_GAP }), []);
    expect(conceptMiss.nextDifficulty).toBeLessThan(calcMiss.nextDifficulty);
    expect(conceptMiss.focusDimension).toBe(DifficultyDimension.CONCEPT);
  });

  it("repeated concept gaps on the same skill drop further than a single one", () => {
    const oneOff = decideNextDifficulty(Difficulty.HARD, makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CONCEPT_GAP }), []);
    const repeated = decideNextDifficulty(
      Difficulty.HARD,
      makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CONCEPT_GAP }),
      [
        makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CONCEPT_GAP }),
        makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CONCEPT_GAP }),
      ]
    );
    expect(repeated.nextDifficulty).toBeLessThan(oneOff.nextDifficulty);
  });

  it("correct but slow holds difficulty rather than stepping up (§12 accurate-but-not-fluent)", () => {
    const result = decideNextDifficulty(Difficulty.MEDIUM, makeAttempt({ isCorrect: true, relativeSpeed: RelativeSpeed.SLOW }), []);
    expect(result.nextDifficulty).toBe(Difficulty.MEDIUM);
    expect(result.triggeredAdaptation).toBe(false);
  });

  it("never steps below FOUNDATION or above EXPERT", () => {
    const atFloor = decideNextDifficulty(Difficulty.FOUNDATION, makeAttempt({ isCorrect: false, errorCategory: ErrorCategory.CONCEPT_GAP }), []);
    expect(atFloor.nextDifficulty).toBe(Difficulty.FOUNDATION);

    const atCeiling = decideNextDifficulty(Difficulty.EXPERT, makeAttempt({ isCorrect: true, relativeSpeed: RelativeSpeed.FAST }), []);
    expect(atCeiling.nextDifficulty).toBe(Difficulty.EXPERT);
  });
});
