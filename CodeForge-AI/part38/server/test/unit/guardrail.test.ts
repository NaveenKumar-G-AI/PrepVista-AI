import { describe, expect, it } from "vitest";
import { MasteryLevel, SkillTrend } from "../../src/domain/enums";
import type { NarrativeFacts } from "../../src/services/narrative/ai-client";
import { buildFallbackNarrative, validateNarrative, validateNarrativeResult } from "../../src/services/narrative/guardrail";

const baseFacts: NarrativeFacts = {
  studentName: "Kavya Iyer",
  overallMastery: MasteryLevel.COMPETENT,
  targetRole: "Backend Developer",
  roleReadiness: "NEAR_READY",
  skills: [
    { name: "Python", level: MasteryLevel.PROFICIENT, trend: SkillTrend.UP },
    { name: "SQL", level: MasteryLevel.DEVELOPING, trend: SkillTrend.UP },
    { name: "System Design", level: MasteryLevel.FOUNDATIONAL, trend: SkillTrend.UP },
  ],
  strengths: [{ title: "Python — Proficient", skill: "Python" }],
  weaknesses: [{ title: "System Design — Foundational", impact: "Blocking", recommendedAction: "Study system design" }],
  nextBestAction: "Complete the System Design Fundamentals module",
  hasProjectEvidence: false,
  hasInterviewEvidence: false,
  hasGrowthData: true,
};

describe("narrative guardrail — golden AI test (brief §78)", () => {
  it("rejects a narrative that upgrades a skill's mastery level", () => {
    const contradictory = "Kavya has made great progress. SQL proficiency is now Advanced, well ahead of schedule.";
    const result = validateNarrative(contradictory, baseFacts);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("SQL"))).toBe(true);
  });

  it("rejects a narrative that fabricates project work when none exists", () => {
    const fabricated = "Kavya built a production project deployed to real users, demonstrating strong Python skills.";
    const result = validateNarrative(fabricated, baseFacts);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("project"))).toBe(true);
  });

  it("rejects a narrative that fabricates a passed technical interview when none exists", () => {
    const fabricated = "Kavya passed the technical interview with flying colors.";
    const result = validateNarrative(fabricated, baseFacts);
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.toLowerCase().includes("interview"))).toBe(true);
  });

  it("accepts a narrative consistent with the facts", () => {
    const consistent =
      "Kavya shows Proficient-level Python skills with an upward trend, while System Design remains Foundational " +
      "and is the current blocker for Backend Developer readiness.";
    const result = validateNarrative(consistent, baseFacts);
    expect(result.valid).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("validateNarrativeResult checks every narrative field, not just one", () => {
    const result = validateNarrativeResult(
      {
        executiveSummary: "Kavya is Competent overall.",
        strengthsNarrative: "Python is Proficient.",
        weaknessesNarrative: "System Design is Advanced and needs work.", // contradiction lives here
        growthNarrative: "Steady progress recently.",
      },
      baseFacts,
    );
    expect(result.valid).toBe(false);
    expect(result.violations.some((v) => v.includes("System Design"))).toBe(true);
  });

  it("the deterministic fallback narrative is always valid by construction", () => {
    const fallback = buildFallbackNarrative(baseFacts);
    const result = validateNarrativeResult(fallback, baseFacts);
    expect(result.valid).toBe(true);
    expect(fallback.executiveSummary).toContain("Kavya Iyer");
  });

  it("fallback narrative is honest about missing project/interview evidence rather than silent", () => {
    const fallback = buildFallbackNarrative(baseFacts);
    const combined = `${fallback.executiveSummary} ${fallback.strengthsNarrative} ${fallback.weaknessesNarrative} ${fallback.growthNarrative}`;
    expect(combined.toLowerCase()).not.toMatch(/built (a|an|the) production|passed (the|a|an) (technical )?interview/);
  });
});
