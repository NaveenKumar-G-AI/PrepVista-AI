import { describe, expect, it } from "vitest";
import { buildCoverageReport, checkCompletion, updateSkillCoverage } from "../../src/engine/coverage.js";
import { asSkillId, type BlueprintSkillTarget, type SessionCoverage } from "../../src/domain/types.js";

const SKILL_A = asSkillId("skill_a");
const SKILL_B = asSkillId("skill_b");

const CORE_SKILL: BlueprintSkillTarget = { skillId: SKILL_A, importance: "CORE", minQuestions: 2, maxQuestions: 4 };
const SUPPORTING_SKILL: BlueprintSkillTarget = { skillId: SKILL_B, importance: "SUPPORTING", minQuestions: 1, maxQuestions: 2 };

describe("updateSkillCoverage", () => {
  it("starts a fresh skill as NOT_ASSESSED with zero questions", () => {
    const entry = updateSkillCoverage(CORE_SKILL, undefined, 0, 0, "UNASSESSED", 0);
    expect(entry.status).toBe("NOT_ASSESSED");
    expect(entry.questionsAsked).toBe(0);
  });

  it("marks SUFFICIENT only once minQuestions is met AND evidence is VERIFIED with confidence >= 0.6", () => {
    const belowMin = updateSkillCoverage(
      CORE_SKILL,
      { skillId: SKILL_A, importance: "CORE", questionsAsked: 1, followUpDepth: 0, currentEvidenceState: "VERIFIED", currentConfidence: 0.9, status: "PARTIAL" },
      0,
      0,
      "VERIFIED",
      0.9,
    );
    expect(belowMin.status).not.toBe("SUFFICIENT"); // only 1 question asked, min is 2

    const atMin = updateSkillCoverage(CORE_SKILL, { ...belowMin, questionsAsked: 2 }, 0, 0, "VERIFIED", 0.9);
    expect(atMin.status).toBe("SUFFICIENT");
  });

  it("never marks SUFFICIENT on confidence alone without VERIFIED evidence state", () => {
    const entry = updateSkillCoverage(
      CORE_SKILL,
      { skillId: SKILL_A, importance: "CORE", questionsAsked: 3, followUpDepth: 0, currentEvidenceState: "PARTIALLY_VERIFIED", currentConfidence: 0.95, status: "PARTIAL" },
      0,
      0,
      "PARTIALLY_VERIFIED",
      0.95,
    );
    expect(entry.status).not.toBe("SUFFICIENT");
  });

  it("accumulates questionsAsked and followUpDepth via deltas", () => {
    const first = updateSkillCoverage(CORE_SKILL, undefined, 1, 0, "UNASSESSED", 0);
    const second = updateSkillCoverage(CORE_SKILL, first, 1, 1, "PARTIALLY_VERIFIED", 0.5);
    expect(second.questionsAsked).toBe(2);
    expect(second.followUpDepth).toBe(1);
  });
});

describe("buildCoverageReport", () => {
  it("buckets every required skill into exactly one category", () => {
    const coverage: SessionCoverage = {
      [SKILL_A]: { skillId: SKILL_A, importance: "CORE", questionsAsked: 2, followUpDepth: 0, currentEvidenceState: "VERIFIED", currentConfidence: 0.7, status: "SUFFICIENT" },
      [SKILL_B]: { skillId: SKILL_B, importance: "SUPPORTING", questionsAsked: 1, followUpDepth: 0, currentEvidenceState: "UNCERTAIN", currentConfidence: 0.2, status: "UNCERTAIN" },
    };
    const report = buildCoverageReport([CORE_SKILL, SUPPORTING_SKILL], coverage);
    expect(report.sufficientSkillIds).toEqual([SKILL_A]);
    expect(report.uncertainSkillIds).toEqual([SKILL_B]);
    expect(report.notAssessedSkillIds).toEqual([]);
  });

  it("treats a skill with no coverage entry at all as NOT_ASSESSED", () => {
    const report = buildCoverageReport([CORE_SKILL], {});
    expect(report.notAssessedSkillIds).toEqual([SKILL_A]);
  });
});

describe("checkCompletion — Phase 23: never claim completion without the evidence", () => {
  const requirements = { minSkillsSufficientlyAssessed: "ALL_CORE" as const, minQuestionsTotal: 2, maxQuestionsTotal: 10 };

  it("is not complete when below the minimum question count, even if skills look done", () => {
    const coverage: SessionCoverage = {
      [SKILL_A]: { skillId: SKILL_A, importance: "CORE", questionsAsked: 2, followUpDepth: 0, currentEvidenceState: "VERIFIED", currentConfidence: 0.9, status: "SUFFICIENT" },
    };
    const result = checkCompletion([CORE_SKILL], coverage, requirements, 1);
    expect(result.isComplete).toBe(false);
  });

  it("is not complete while any CORE skill is not yet SUFFICIENT", () => {
    const coverage: SessionCoverage = {
      [SKILL_A]: { skillId: SKILL_A, importance: "CORE", questionsAsked: 2, followUpDepth: 0, currentEvidenceState: "PARTIALLY_VERIFIED", currentConfidence: 0.5, status: "PARTIAL" },
    };
    const result = checkCompletion([CORE_SKILL], coverage, requirements, 2);
    expect(result.isComplete).toBe(false);
    expect(result.reason).toContain(SKILL_A);
  });

  it("is complete once all CORE skills are SUFFICIENT and the question floor is met", () => {
    const coverage: SessionCoverage = {
      [SKILL_A]: { skillId: SKILL_A, importance: "CORE", questionsAsked: 2, followUpDepth: 0, currentEvidenceState: "VERIFIED", currentConfidence: 0.8, status: "SUFFICIENT" },
    };
    const result = checkCompletion([CORE_SKILL], coverage, requirements, 2);
    expect(result.isComplete).toBe(true);
  });

  it("forces completion once the max question budget is reached, regardless of skill status", () => {
    const result = checkCompletion([CORE_SKILL], {}, requirements, 10);
    expect(result.isComplete).toBe(true);
    expect(result.reason).toMatch(/maximum/i);
  });

  it("supports a numeric minSkillsSufficientlyAssessed instead of ALL_CORE", () => {
    const numericRequirements = { minSkillsSufficientlyAssessed: 1, minQuestionsTotal: 1, maxQuestionsTotal: 10 };
    const coverage: SessionCoverage = {
      [SKILL_B]: { skillId: SKILL_B, importance: "SUPPORTING", questionsAsked: 1, followUpDepth: 0, currentEvidenceState: "VERIFIED", currentConfidence: 0.8, status: "SUFFICIENT" },
    };
    const result = checkCompletion([CORE_SKILL, SUPPORTING_SKILL], coverage, numericRequirements, 1);
    expect(result.isComplete).toBe(true);
  });
});
