import { describe, expect, it } from "vitest";
import { rankCandidates, SelectionContext } from "../src/engines/selectionEngine";
import { Difficulty, DifficultyDimension, PracticeObjective, QuestionType } from "../src/domain/enums";
import { Question } from "../src/domain/types";
import { ExposureRow } from "../src/repositories/questionRepository";

function q(id: string, overrides: Partial<Question> = {}): Question {
  return {
    id,
    domain: "d",
    topic: "t",
    subtopic: "st",
    skillId: "SK_TEST",
    prerequisites: [],
    difficulty: { level: Difficulty.MEDIUM, conceptComplexity: 3, reasoningComplexity: 2, calculationComplexity: 2, timePressure: 2, distractorQuality: 3, transferDifficulty: 2 },
    questionType: QuestionType.STANDARD_PRACTICE,
    cognitiveDemand: "APPLICATION",
    expectedTimeSeconds: 60,
    prompt: id,
    options: [{ id: "a", text: "1", isCorrect: true }],
    explanation: { correctReasoning: "x" },
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

const baseCtx: SelectionContext = {
  targetDifficulty: Difficulty.MEDIUM,
  objective: PracticeObjective.IMPROVE_ACCURACY,
  suspectedMemorization: false,
  recentSkillIds: [],
  recentSubtopics: [],
};

describe("selectionEngine", () => {
  it("prefers the question closest to the target difficulty", () => {
    const near = q("near", { difficulty: { ...q("x").difficulty, level: Difficulty.MEDIUM } });
    const far = q("far", { difficulty: { ...q("x").difficulty, level: Difficulty.EXPERT } });
    const ranked = rankCandidates([far, near], new Map(), baseCtx);
    expect(ranked[0].question.id).toBe("near");
  });

  it("penalizes a question that's already been answered correctly twice (anti-memorization, §17)", () => {
    const fresh = q("fresh");
    const overexposed = q("overexposed");
    const exposureMap = new Map<string, ExposureRow>([
      ["overexposed", { studentId: "s", questionId: "overexposed", seenCount: 3, correctCount: 2, lastSeenAt: null }],
    ]);
    const ranked = rankCandidates([overexposed, fresh], exposureMap, baseCtx);
    expect(ranked[0].question.id).toBe("fresh");
  });

  it("boosts questions matching the active focus dimension after an adaptation", () => {
    const highCalc = q("high-calc", { difficulty: { ...q("x").difficulty, calculationComplexity: 5 } });
    const lowCalc = q("low-calc", { difficulty: { ...q("x").difficulty, calculationComplexity: 1 } });
    const ctx: SelectionContext = { ...baseCtx, focusDimension: DifficultyDimension.CALCULATION };
    const ranked = rankCandidates([lowCalc, highCalc], new Map(), ctx);
    expect(ranked[0].question.id).toBe("high-calc");
  });

  it("boosts question types aligned with the current objective", () => {
    const transfer = q("transfer-q", { questionType: QuestionType.TRANSFER });
    const concept = q("concept-q", { questionType: QuestionType.CONCEPT_CHECK });
    const ctx: SelectionContext = { ...baseCtx, objective: PracticeObjective.TRANSFER_SKILL };
    const ranked = rankCandidates([concept, transfer], new Map(), ctx);
    expect(ranked[0].question.id).toBe("transfer-q");
  });

  it("every candidate gets a score breakdown for explainability (§15)", () => {
    const ranked = rankCandidates([q("a"), q("b")], new Map(), baseCtx);
    for (const r of ranked) {
      expect(r.breakdown.length).toBeGreaterThan(0);
      expect(r.breakdown.some((b) => b.factor === "difficulty_match")).toBe(true);
    }
  });
});
