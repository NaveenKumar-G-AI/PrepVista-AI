import { describe, expect, it } from "vitest";
import { assessMastery } from "../src/engines/mastery";
import { ConfidenceCalibration, Difficulty, MasteryState, QuestionType, RelativeSpeed } from "../src/domain/enums";
import { Attempt, SkillPracticeState } from "../src/domain/types";

function makeState(overrides: Partial<SkillPracticeState> = {}): SkillPracticeState {
  return {
    studentId: "s1",
    skillId: "SK_TEST",
    lastPracticed: new Date().toISOString(),
    attemptCount: 10,
    correctCount: 9,
    recentAccuracy: 0.9,
    averageTimeSeconds: 40,
    confidenceCalibration: ConfidenceCalibration.CALIBRATED,
    errorDistribution: {},
    difficultyExposure: {},
    hintUsageRate: 0.1,
    streak: 3,
    masteryState: MasteryState.DEVELOPING,
    nextReview: null,
    currentDifficulty: Difficulty.MEDIUM,
    suspectedMemorization: false,
    ...overrides,
  };
}

function makeAttempt(questionId: string, isCorrect: boolean, hintsUsed = 0): Attempt {
  return {
    id: `a-${questionId}-${Math.random()}`,
    studentId: "s1",
    sessionId: "sess",
    questionId,
    skillId: "SK_TEST",
    selectedOptionId: "opt",
    isCorrect,
    timeToStartMs: 100,
    totalTimeMs: 20_000,
    expectedTimeMs: 40_000,
    relativeSpeed: RelativeSpeed.ON_PACE,
    hintsUsed,
    confidence: null,
    errorCategory: null,
    performanceInterpretation: null,
    difficultyAtAttempt: { level: Difficulty.MEDIUM, conceptComplexity: 3, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 3, transferDifficulty: 2 },
    questionIndexInSession: 1,
    createdAt: new Date().toISOString(),
  };
}

describe("assessMastery", () => {
  it("does not grant mastery from a single correct answer, even at high recentAccuracy", () => {
    const state = makeState({ attemptCount: 4, recentAccuracy: 1 });
    const attempts = [makeAttempt("q1", true)];
    const typeMap = new Map([["q1", QuestionType.APPLICATION]]);
    const result = assessMastery(state, attempts, typeMap);
    expect(result.state).not.toBe(MasteryState.VERIFIED_MASTERY);
  });

  it("requires application AND transfer evidence when the skill has that content", () => {
    const state = makeState({ recentAccuracy: 0.9 });
    // 5 distinct correct, but none are APPLICATION or TRANSFER.
    const attempts = ["q1", "q2", "q3", "q4", "q5"].map((id) => makeAttempt(id, true));
    const typeMap = new Map(["q1", "q2", "q3", "q4", "q5"].map((id) => [id, QuestionType.STANDARD_PRACTICE]));
    const result = assessMastery(state, attempts, typeMap, { skillHasApplicationContent: true, skillHasTransferContent: true });
    expect(result.state).toBe(MasteryState.APPROACHING_MASTERY);
  });

  it("drops the application/transfer requirement for a skill with no such content (e.g. a pure foundation skill)", () => {
    const state = makeState({ recentAccuracy: 0.9 });
    const attempts = ["q1", "q2", "q3", "q4", "q5"].map((id) => makeAttempt(id, true));
    const typeMap = new Map(["q1", "q2", "q3", "q4", "q5"].map((id) => [id, QuestionType.CONCEPT_CHECK]));
    const result = assessMastery(state, attempts, typeMap, { skillHasApplicationContent: false, skillHasTransferContent: false });
    expect(result.state).toBe(MasteryState.VERIFIED_MASTERY);
  });

  it("grants VERIFIED_MASTERY with enough diverse, low-hint, high-accuracy evidence", () => {
    const state = makeState({ recentAccuracy: 0.9 });
    const attempts = [
      makeAttempt("q1", true),
      makeAttempt("q2", true),
      makeAttempt("q3", true, 0),
      makeAttempt("q4", true),
    ];
    const typeMap = new Map<string, QuestionType>([
      ["q1", QuestionType.STANDARD_PRACTICE],
      ["q2", QuestionType.APPLICATION],
      ["q3", QuestionType.TRANSFER],
      ["q4", QuestionType.STANDARD_PRACTICE],
    ]);
    const result = assessMastery(state, attempts, typeMap);
    expect(result.state).toBe(MasteryState.VERIFIED_MASTERY);
  });

  it("blocks VERIFIED_MASTERY when memorization is suspected, regardless of accuracy (§17)", () => {
    const state = makeState({ recentAccuracy: 0.95, suspectedMemorization: true });
    const attempts = ["q1", "q2", "q3", "q4"].map((id) => makeAttempt(id, true));
    const typeMap = new Map<string, QuestionType>([
      ["q1", QuestionType.APPLICATION],
      ["q2", QuestionType.TRANSFER],
      ["q3", QuestionType.STANDARD_PRACTICE],
      ["q4", QuestionType.STANDARD_PRACTICE],
    ]);
    const result = assessMastery(state, attempts, typeMap);
    expect(result.state).toBe(MasteryState.MASTERY_NOT_STABLE);
  });

  it("high hint dependence keeps a skill out of VERIFIED_MASTERY even with correct answers", () => {
    const state = makeState({ recentAccuracy: 0.9 });
    const attempts = [
      makeAttempt("q1", true, 3),
      makeAttempt("q2", true, 3),
      makeAttempt("q3", true, 3),
      makeAttempt("q4", true, 3),
    ];
    const typeMap = new Map<string, QuestionType>([
      ["q1", QuestionType.APPLICATION],
      ["q2", QuestionType.TRANSFER],
      ["q3", QuestionType.STANDARD_PRACTICE],
      ["q4", QuestionType.STANDARD_PRACTICE],
    ]);
    const result = assessMastery(state, attempts, typeMap);
    expect(result.state).not.toBe(MasteryState.VERIFIED_MASTERY);
  });
});
