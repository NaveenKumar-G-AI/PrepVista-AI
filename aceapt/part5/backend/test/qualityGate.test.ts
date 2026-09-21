import { describe, expect, it } from "vitest";
import { runQualityGate } from "../src/generation/qualityGate";
import { QuestionHealth, QuestionSource, QuestionType } from "../src/domain/enums";
import { Question, Skill } from "../src/domain/types";

const skills = new Map<string, Skill>([["SK_TEST", { id: "SK_TEST", domain: "d", topic: "t", subtopic: "st", name: "Test Skill", prerequisites: [] }]]);

function validQuestion(overrides: Partial<Question> = {}): Question {
  return {
    id: "q1",
    domain: "d",
    topic: "t",
    subtopic: "st",
    skillId: "SK_TEST",
    prerequisites: [],
    difficulty: { level: 3, conceptComplexity: 3, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 3, transferDifficulty: 2 },
    questionType: QuestionType.STANDARD_PRACTICE,
    cognitiveDemand: "APPLICATION",
    expectedTimeSeconds: 60,
    prompt: "What is 20% of 50?",
    options: [
      { id: "a", text: "10", isCorrect: true },
      { id: "b", text: "5", isCorrect: false },
      { id: "c", text: "15", isCorrect: false },
      { id: "d", text: "20", isCorrect: false },
    ],
    explanation: { correctReasoning: "20% of 50 is (20/100) * 50 = 10." },
    hints: [
      { level: 1, label: "a", text: "think" },
      { level: 2, label: "b", text: "convert" },
    ],
    commonMisconceptions: [],
    errorCategoriesCovered: [],
    tags: [],
    version: 1,
    qualityStatus: QuestionHealth.REVIEW_REQUIRED,
    source: QuestionSource.TEMPLATE_GENERATED,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("qualityGate", () => {
  it("passes a well-formed template question as HEALTHY", () => {
    const result = runQualityGate(validQuestion(), skills);
    expect(result.status).toBe(QuestionHealth.HEALTHY);
    expect(result.passed).toBe(true);
  });

  it("rejects a question with two correct options (ambiguous answer)", () => {
    const q = validQuestion({ options: [{ id: "a", text: "10", isCorrect: true }, { id: "b", text: "10.0", isCorrect: true }, { id: "c", text: "5", isCorrect: false }, { id: "d", text: "20", isCorrect: false }] });
    const result = runQualityGate(q, skills);
    expect(result.passed).toBe(false);
    expect(result.status).not.toBe(QuestionHealth.HEALTHY);
  });

  it("rejects a question with zero correct options", () => {
    const q = validQuestion({ options: [{ id: "a", text: "1", isCorrect: false }, { id: "b", text: "2", isCorrect: false }, { id: "c", text: "3", isCorrect: false }, { id: "d", text: "4", isCorrect: false }] });
    const result = runQualityGate(q, skills);
    expect(result.passed).toBe(false);
  });

  it("rejects duplicate option text (would make the correct answer ambiguous)", () => {
    const q = validQuestion({ options: [{ id: "a", text: "10", isCorrect: true }, { id: "b", text: "10", isCorrect: false }, { id: "c", text: "5", isCorrect: false }, { id: "d", text: "20", isCorrect: false }] });
    const result = runQualityGate(q, skills);
    expect(result.passed).toBe(false);
  });

  it("rejects a question mapped to an unknown skill", () => {
    const q = validQuestion({ skillId: "SK_DOES_NOT_EXIST" });
    const result = runQualityGate(q, skills);
    expect(result.passed).toBe(false);
    expect(result.issues.some((i) => i.includes("SK_DOES_NOT_EXIST"))).toBe(true);
  });

  it("rejects a broken hint progression (gap in levels)", () => {
    const q = validQuestion({ hints: [{ level: 1, label: "a", text: "x" }, { level: 3, label: "b", text: "y" }] });
    const result = runQualityGate(q, skills);
    expect(result.passed).toBe(false);
  });

  it("never marks AI-generated content HEALTHY straight away, even if structurally perfect (§41 — human answer verification required)", () => {
    const q = validQuestion({ source: QuestionSource.AI_GENERATED });
    const result = runQualityGate(q, skills);
    expect(result.status).toBe(QuestionHealth.REVIEW_REQUIRED);
    expect(result.passed).toBe(false);
  });

  it("rejects a missing/too-short explanation", () => {
    const q = validQuestion({ explanation: { correctReasoning: "ok" } });
    const result = runQualityGate(q, skills);
    expect(result.passed).toBe(false);
  });
});
