import { describe, expect, it } from "vitest";
import { validateQuestion } from "@/lib/domain/validation/questionValidator";
import { SKILL_MAP } from "@/data/seed/skills";
import { QUESTIONS, type SeedQuestion } from "@/data/seed/questions";

const BASE = QUESTIONS[0]!;

describe("validateQuestion", () => {
  it("validates every question currently in the seed bank (regression check)", () => {
    const results = QUESTIONS.map((q) => validateQuestion(q, SKILL_MAP));
    const rejected = results.filter((r) => !r.valid);
    expect(rejected).toHaveLength(0);
    expect(results).toHaveLength(44);
  });

  it("rejects a question whose correct answer is not present in its options", () => {
    const bad: SeedQuestion = { ...BASE, correctAnswer: "not-an-option" };
    const result = validateQuestion(bad, SKILL_MAP);
    expect(result.valid).toBe(false);
    expect(result.status).toBe("REJECTED");
    expect(result.notes).toMatch(/not present/i);
  });

  it("rejects a question with duplicate options", () => {
    const bad: SeedQuestion = { ...BASE, options: ["A", "A", "B", "C"], correctAnswer: "A" };
    expect(validateQuestion(bad, SKILL_MAP).valid).toBe(false);
  });

  it("rejects a question referencing a skill that doesn't exist in the hierarchy", () => {
    const bad: SeedQuestion = { ...BASE, skillNodeId: "NOT_A_REAL_SKILL" };
    expect(validateQuestion(bad, SKILL_MAP).valid).toBe(false);
  });

  it("rejects an out-of-range difficulty", () => {
    const bad = { ...BASE, difficulty: 7 } as unknown as SeedQuestion;
    expect(validateQuestion(bad, SKILL_MAP).valid).toBe(false);
  });

  it("rejects a question with fewer than two options", () => {
    const bad: SeedQuestion = { ...BASE, options: ["OnlyOne"], correctAnswer: "OnlyOne" };
    expect(validateQuestion(bad, SKILL_MAP).valid).toBe(false);
  });

  it("rejects a question with no skill tags", () => {
    const bad: SeedQuestion = { ...BASE, skillTags: [] };
    expect(validateQuestion(bad, SKILL_MAP).valid).toBe(false);
  });

  it("accepts a well-formed question", () => {
    const result = validateQuestion(BASE, SKILL_MAP);
    expect(result.valid).toBe(true);
    expect(result.status).toBe("VALIDATED");
  });
});
