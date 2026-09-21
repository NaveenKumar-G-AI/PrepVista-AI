import { describe, expect, it } from "vitest";
import { classifyError } from "../src/engines/errorClassifier";
import { ErrorCategory, RelativeSpeed } from "../src/domain/enums";
import { Question } from "../src/domain/types";

function makeQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    domain: "d",
    topic: "t",
    subtopic: "st",
    skillId: "SK_TEST",
    prerequisites: [],
    difficulty: { level: 3, conceptComplexity: 3, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 3, transferDifficulty: 2 },
    questionType: "STANDARD_PRACTICE" as any,
    cognitiveDemand: "APPLICATION",
    expectedTimeSeconds: 60,
    prompt: "test",
    options: [
      { id: "correct", text: "42", isCorrect: true },
      { id: "concept", text: "10", isCorrect: false, misconception: ErrorCategory.CONCEPT_GAP, misconceptionNote: "note" },
      { id: "calc", text: "43", isCorrect: false, misconception: ErrorCategory.CALCULATION_ERROR, misconceptionNote: "note" },
      { id: "untagged", text: "99", isCorrect: false },
    ],
    explanation: { correctReasoning: "because" },
    hints: [],
    commonMisconceptions: [],
    errorCategoriesCovered: [],
    tags: [],
    version: 1,
    qualityStatus: "HEALTHY" as any,
    source: "SEED" as any,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("errorClassifier", () => {
  it("trusts a tagged distractor over any timing heuristic", () => {
    const q = makeQuestion();
    const result = classifyError({
      question: q,
      selectedOptionId: "concept",
      relativeSpeed: RelativeSpeed.FAST, // would otherwise look like a guess
      totalTimeMs: 1000,
      expectedTimeMs: 60_000,
      hintsUsed: 0,
    });
    expect(result.category).toBe(ErrorCategory.CONCEPT_GAP);
    expect(result.confidence).toBe("HIGH");
  });

  it("classifies no answer submitted as TIME_PRESSURE", () => {
    const result = classifyError({
      question: makeQuestion(),
      selectedOptionId: null,
      relativeSpeed: RelativeSpeed.SLOW,
      totalTimeMs: 90_000,
      expectedTimeMs: 60_000,
      hintsUsed: 0,
    });
    expect(result.category).toBe(ErrorCategory.TIME_PRESSURE);
  });

  it("falls back to GUESS for a very fast, untagged, hint-free wrong answer", () => {
    const result = classifyError({
      question: makeQuestion(),
      selectedOptionId: "untagged",
      relativeSpeed: RelativeSpeed.FAST,
      totalTimeMs: 5_000,
      expectedTimeMs: 60_000,
      hintsUsed: 0,
    });
    expect(result.category).toBe(ErrorCategory.GUESS);
  });

  it("falls back to CONCEPT_GAP for a very slow, untagged wrong answer", () => {
    const result = classifyError({
      question: makeQuestion(),
      selectedOptionId: "untagged",
      relativeSpeed: RelativeSpeed.SLOW,
      totalTimeMs: 130_000,
      expectedTimeMs: 60_000,
      hintsUsed: 0,
    });
    expect(result.category).toBe(ErrorCategory.CONCEPT_GAP);
  });

  it("falls back to PARTIAL_UNDERSTANDING when slow with multiple hints already used", () => {
    const result = classifyError({
      question: makeQuestion(),
      selectedOptionId: "untagged",
      relativeSpeed: RelativeSpeed.SLOW,
      totalTimeMs: 80_000,
      expectedTimeMs: 60_000,
      hintsUsed: 2,
    });
    expect(result.category).toBe(ErrorCategory.PARTIAL_UNDERSTANDING);
  });
});
