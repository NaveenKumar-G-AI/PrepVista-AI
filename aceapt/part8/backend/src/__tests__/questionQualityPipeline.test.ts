import { describe, it, expect } from "vitest";
import { runQuestionQualityPipeline } from "../services/questionQualityPipeline.js";
import type { GeneratedQuestionCandidate } from "../services/ai/types.js";

function goodCandidate(overrides: Partial<GeneratedQuestionCandidate> = {}): GeneratedQuestionCandidate {
  return {
    prompt: "A shop increases a price by 20% then decreases the new price by 20%. What is the net percentage change?",
    choices: [
      { id: "a", text: "No change" },
      { id: "b", text: "4% decrease" },
      { id: "c", text: "4% increase" },
      { id: "d", text: "20% decrease" },
    ],
    correctChoiceId: "b",
    explanation: "1.2 * 0.8 = 0.96, a net 4% decrease from the original price.",
    reportedSkillTag: "percentages",
    reportedDifficulty: 0.55,
    expectedTimeSeconds: 60,
    ...overrides,
  };
}

describe("runQuestionQualityPipeline", () => {
  const baseParams = { expectedSkillKey: "percentages", requestedNovelty: "NOVEL" as const, requestedDifficulty: 0.5, existingPrompts: [] as string[] };

  it("approves a well-formed, on-topic, unique candidate", () => {
    const result = runQuestionQualityPipeline(goodCandidate(), baseParams);
    expect(result.approved).toBe(true);
    expect(result.checks.every((c) => c.passed)).toBe(true);
  });

  it("rejects when correct_choice_id doesn't match any choice", () => {
    const result = runQuestionQualityPipeline(goodCandidate({ correctChoiceId: "z" }), baseParams);
    expect(result.approved).toBe(false);
    expect(result.checks.find((c) => c.name === "answer_validation")?.passed).toBe(false);
  });

  it("rejects duplicate choice text (ambiguity)", () => {
    const result = runQuestionQualityPipeline(
      goodCandidate({ choices: [{ id: "a", text: "4% decrease" }, { id: "b", text: "4% decrease" }, { id: "c", text: "x" }, { id: "d", text: "y" }] }),
      baseParams
    );
    expect(result.approved).toBe(false);
    expect(result.checks.find((c) => c.name === "ambiguity_check")?.passed).toBe(false);
  });

  it("rejects a near-duplicate of an existing approved question", () => {
    const existing = "A shop increases a price by 20 percent then decreases the new price by 20 percent. What is the net percentage change overall?";
    const result = runQuestionQualityPipeline(goodCandidate(), { ...baseParams, existingPrompts: [existing] });
    expect(result.approved).toBe(false);
    expect(result.checks.find((c) => c.name === "duplicate_check")?.passed).toBe(false);
  });

  it("rejects an off-topic skill tag", () => {
    const result = runQuestionQualityPipeline(goodCandidate({ reportedSkillTag: "verbal-analogies" }), baseParams);
    expect(result.approved).toBe(false);
    expect(result.checks.find((c) => c.name === "skill_validation")?.passed).toBe(false);
  });

  it("rejects a difficulty far from the target", () => {
    const result = runQuestionQualityPipeline(goodCandidate({ reportedDifficulty: 0.98 }), baseParams);
    expect(result.approved).toBe(false);
    expect(result.checks.find((c) => c.name === "difficulty_validation")?.passed).toBe(false);
  });
});
