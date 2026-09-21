import { describe, expect, it } from "vitest";
import type { AssessmentProfile } from "../../domain/types.js";
import { generateBlueprint, type QuestionPoolItem } from "../blueprintGenerator.js";

const profile: AssessmentProfile = {
  id: "profile-1",
  name: "Test Profile",
  assessmentType: "test",
  durationMinutes: 30,
  questionCount: 6,
  sections: [{ name: "Section 1", topicIds: ["topic-a"], questionCount: 6 }],
  difficultyDistribution: { easy: 0.3, medium: 0.5, hard: 0.2 },
  negativeMarking: { enabled: true, penaltyFraction: 0.25 },
  scoringRules: { correctMarks: 1, unansweredMarks: 0 },
  targetScore: 80,
  questionTimeExpectationSeconds: 60,
};

function makePool(n: number, difficultyOf: (i: number) => "easy" | "medium" | "hard" = () => "medium"): QuestionPoolItem[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `q${i}`,
    topicId: "topic-a",
    skill: "skill",
    difficulty: difficultyOf(i),
    expectedTimeSeconds: 60,
  }));
}

describe("generateBlueprint", () => {
  it("assembles exactly the requested question count when the pool is ample", () => {
    const pool = makePool(20, (i) => (i < 6 ? "easy" : i < 14 ? "medium" : "hard"));
    const result = generateBlueprint(profile, pool, new Set());
    expect(result.selectedQuestionIds).toHaveLength(6);
    expect(result.validation.questionCountOk).toBe(true);
  });

  it("reports an issue and a short composition when the pool is too small", () => {
    const pool = makePool(2, () => "medium");
    const result = generateBlueprint(profile, pool, new Set());
    expect(result.selectedQuestionIds.length).toBeLessThan(6);
    expect(result.validation.questionCountOk).toBe(false);
    expect(result.validation.issues.length).toBeGreaterThan(0);
  });

  it("returns an empty composition (not a crash) with a completely empty pool", () => {
    const result = generateBlueprint(profile, [], new Set());
    expect(result.selectedQuestionIds).toHaveLength(0);
    expect(result.composition).toHaveLength(0);
  });

  it("prefers novel questions over previously-seen ones when both are available", () => {
    const pool = makePool(12, (i) => (i < 4 ? "easy" : i < 9 ? "medium" : "hard"));
    // Mark every question EXCEPT a few as already seen — only a handful of
    // novel candidates remain per difficulty band.
    const seen = new Set(pool.map((q) => q.id).filter((id) => !["q0", "q4", "q9"].includes(id)));
    const result = generateBlueprint(profile, pool, seen);
    const novelSelected = result.selectedQuestionIds.filter((id) => !seen.has(id));
    expect(novelSelected.length).toBeGreaterThan(0);
  });

  it("falls back to previously-seen questions rather than dropping the slot when no novel ones remain", () => {
    const pool = makePool(6, (i) => (i < 2 ? "easy" : i < 5 ? "medium" : "hard"));
    const allSeen = new Set(pool.map((q) => q.id));
    const result = generateBlueprint(profile, pool, allSeen);
    expect(result.selectedQuestionIds).toHaveLength(6);
  });

  it("never selects the same question twice within one blueprint", () => {
    const pool = makePool(20, (i) => (i < 6 ? "easy" : i < 14 ? "medium" : "hard"));
    const result = generateBlueprint(profile, pool, new Set());
    expect(new Set(result.selectedQuestionIds).size).toBe(result.selectedQuestionIds.length);
  });
});
