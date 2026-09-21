import { describe, expect, it } from "vitest";
import { buildBlueprint, validateBlueprint } from "../../src/domain/blueprint.js";
import {
  architectureInterviewBlueprint,
  codeDefenseBlueprint,
  debuggingInterviewBlueprint,
  deepTechnicalBlueprint,
  followUpVerificationBlueprint,
  projectDefenseBlueprint,
  skillVerificationBlueprint,
  technicalScreeningBlueprint,
} from "../../src/domain/blueprints/index.js";
import { asRoleId, asSkillId, type RoleSkillRequirement } from "../../src/domain/types.js";

const ROLE_ID = asRoleId("role_x");
const SKILLS: RoleSkillRequirement[] = [
  { skillId: asSkillId("skill_a"), skillName: "A", importance: "CORE", targetMastery: 0.7 },
  { skillId: asSkillId("skill_b"), skillName: "B", importance: "IMPORTANT", targetMastery: 0.5 },
  { skillId: asSkillId("skill_c"), skillName: "C", importance: "SUPPORTING", targetMastery: 0.4 },
];

describe("buildBlueprint — generic builder", () => {
  it("produces a structurally valid blueprint from role skills", () => {
    const bp = buildBlueprint({ key: "test", roleId: ROLE_ID, mode: "TECHNICAL_SCREENING", skills: SKILLS, version: "v1" });
    const result = validateBlueprint(bp);
    expect(result.ok).toBe(true);
  });

  it("sets minQuestions <= maxQuestions for every skill by importance tier", () => {
    const bp = buildBlueprint({ key: "test", roleId: ROLE_ID, mode: "TECHNICAL_SCREENING", skills: SKILLS, version: "v1" });
    for (const skill of bp.skills) {
      expect(skill.minQuestions).toBeLessThanOrEqual(skill.maxQuestions);
    }
  });

  it("defaults completionRequirements to ALL_CORE when a CORE skill exists", () => {
    const bp = buildBlueprint({ key: "test", roleId: ROLE_ID, mode: "TECHNICAL_SCREENING", skills: SKILLS, version: "v1" });
    expect(bp.completionRequirements.minSkillsSufficientlyAssessed).toBe("ALL_CORE");
  });

  it("marks forceVerification only for the requested skill ids", () => {
    const bp = buildBlueprint({
      key: "test",
      roleId: ROLE_ID,
      mode: "SKILL_VERIFICATION",
      skills: SKILLS,
      version: "v1",
      forceVerificationSkillIds: ["skill_b"],
    });
    const b = bp.skills.find((s) => s.skillId === "skill_b");
    const a = bp.skills.find((s) => s.skillId === "skill_a");
    expect(b?.forceVerification).toBe(true);
    expect(a?.forceVerification).toBeUndefined();
  });
});

describe("validateBlueprint — rejects structurally invalid blueprints", () => {
  it("rejects a blueprint with zero skills", () => {
    const result = validateBlueprint({
      id: "bp_x",
      key: "x",
      roleId: "role_x",
      mode: "TECHNICAL_SCREENING",
      difficulty: "ADAPTIVE",
      skills: [],
      evidenceSources: [],
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: false, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 30, perQuestionSoftLimitSeconds: 120 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: { dimensions: ["technicalCorrectness"], requireConsistencyCheck: false },
      completionRequirements: { minSkillsSufficientlyAssessed: 1, minQuestionsTotal: 1, maxQuestionsTotal: 5 },
      version: "v1",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects minQuestions > maxQuestions for a skill", () => {
    const result = validateBlueprint({
      id: "bp_x",
      key: "x",
      roleId: "role_x",
      mode: "TECHNICAL_SCREENING",
      difficulty: "ADAPTIVE",
      skills: [{ skillId: "skill_a", importance: "CORE", minQuestions: 5, maxQuestions: 2 }],
      evidenceSources: [],
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: false, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 30, perQuestionSoftLimitSeconds: 120 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: { dimensions: ["technicalCorrectness"], requireConsistencyCheck: false },
      completionRequirements: { minSkillsSufficientlyAssessed: 1, minQuestionsTotal: 1, maxQuestionsTotal: 5 },
      version: "v1",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects an unknown interview mode", () => {
    const result = validateBlueprint({
      id: "bp_x",
      key: "x",
      roleId: "role_x",
      mode: "NOT_A_MODE",
      difficulty: "ADAPTIVE",
      skills: [{ skillId: "skill_a", importance: "CORE", minQuestions: 1, maxQuestions: 2 }],
      evidenceSources: [],
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: false, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 30, perQuestionSoftLimitSeconds: 120 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: { dimensions: ["technicalCorrectness"], requireConsistencyCheck: false },
      completionRequirements: { minSkillsSufficientlyAssessed: 1, minQuestionsTotal: 1, maxQuestionsTotal: 5 },
      version: "v1",
    });
    expect(result.ok).toBe(false);
  });
});

describe("mode factories — Phase 4: one engine, many blueprints", () => {
  const factories = {
    technicalScreeningBlueprint,
    projectDefenseBlueprint,
    codeDefenseBlueprint,
    deepTechnicalBlueprint,
    debuggingInterviewBlueprint,
    architectureInterviewBlueprint,
  };

  for (const [name, factory] of Object.entries(factories)) {
    it(`${name} produces a valid blueprint`, () => {
      const bp = factory({ roleId: ROLE_ID, skills: SKILLS, version: "v1" });
      expect(validateBlueprint(bp).ok).toBe(true);
    });
  }

  it("skillVerificationBlueprint requires targetSkillIds", () => {
    expect(() => skillVerificationBlueprint({ roleId: ROLE_ID, skills: SKILLS, version: "v1" })).toThrow();
  });

  it("skillVerificationBlueprint narrows to only the targeted skills", () => {
    const bp = skillVerificationBlueprint({ roleId: ROLE_ID, skills: SKILLS, version: "v1", targetSkillIds: ["skill_b"] });
    expect(bp.skills.map((s) => s.skillId)).toEqual(["skill_b"]);
    expect(bp.skills[0]?.forceVerification).toBe(true);
  });

  it("followUpVerificationBlueprint caps at 3 questions total", () => {
    const bp = followUpVerificationBlueprint({ roleId: ROLE_ID, skills: SKILLS, version: "v1", targetSkillIds: ["skill_a"] });
    expect(bp.completionRequirements.maxQuestionsTotal).toBeLessThanOrEqual(3);
  });

  it("every mode factory sets mode to its own name", () => {
    expect(technicalScreeningBlueprint({ roleId: ROLE_ID, skills: SKILLS, version: "v1" }).mode).toBe("TECHNICAL_SCREENING");
    expect(projectDefenseBlueprint({ roleId: ROLE_ID, skills: SKILLS, version: "v1" }).mode).toBe("PROJECT_DEFENSE");
    expect(codeDefenseBlueprint({ roleId: ROLE_ID, skills: SKILLS, version: "v1" }).mode).toBe("CODE_DEFENSE");
  });
});
