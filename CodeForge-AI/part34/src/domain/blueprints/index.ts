// ============================================================================
// Phase 4 — "Support a configurable interview engine capable of modes such
// as... Do not build independent interview engines for each mode. Use one
// core engine with configurable blueprints."
//
// Every factory below is a thin set of defaults over buildBlueprint(). None
// of them contain question-selection, follow-up, or evaluation logic — that
// all lives in src/engine/**, shared across every mode.
// ============================================================================

import { buildBlueprint } from "../blueprint.js";
import type { InterviewBlueprint, RoleId, RoleSkillRequirement } from "../types.js";

export interface ModeFactoryInput {
  roleId: RoleId;
  skills: RoleSkillRequirement[];
  version: string;
  /** Required for SKILL_VERIFICATION / FOLLOW_UP_VERIFICATION — which skill(s) are the actual target. */
  targetSkillIds?: string[];
}

/** Phase: broad, shallow coverage — a fast first pass across many role skills. */
export function technicalScreeningBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  return buildBlueprint({
    key: "technical-screening",
    roleId: input.roleId,
    mode: "TECHNICAL_SCREENING",
    skills: input.skills,
    version: input.version,
    difficulty: "ADAPTIVE",
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: false, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 25, perQuestionSoftLimitSeconds: 120 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 1 },
      evaluationConfig: { dimensions: ["technicalCorrectness", "communicationClarity"], requireConsistencyCheck: false },
    },
  });
}

/** Phase 12 — deep dive on a completed project; code-grounded whenever project evidence exists. */
export function projectDefenseBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  return buildBlueprint({
    key: "project-defense",
    roleId: input.roleId,
    mode: "PROJECT_DEFENSE",
    skills: input.skills,
    version: input.version,
    evidenceSources: ["PROJECT_SUBMISSION", "CODE_QUALITY_ANALYSIS", "COMPLEXITY_ANALYSIS", "REASONING_VERIFICATION", "UNDERSTANDING_CHECK"],
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: true, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 40, perQuestionSoftLimitSeconds: 200 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: {
        dimensions: ["technicalCorrectness", "reasoningQuality", "understanding", "application", "communicationClarity"],
        requireConsistencyCheck: true,
      },
    },
  });
}

/** Phase 13 — questions anchored to actual submitted code excerpts. */
export function codeDefenseBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  return buildBlueprint({
    key: "code-defense",
    roleId: input.roleId,
    mode: "CODE_DEFENSE",
    skills: input.skills,
    version: input.version,
    evidenceSources: ["PROJECT_SUBMISSION", "CODING_CHALLENGE", "CODE_QUALITY_ANALYSIS", "COMPLEXITY_ANALYSIS"],
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: true, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 30, perQuestionSoftLimitSeconds: 150 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: {
        dimensions: ["technicalCorrectness", "understanding", "application", "depth"],
        requireConsistencyCheck: true,
      },
    },
  });
}

/** High difficulty, narrower skill set, deepest follow-up chains. */
export function deepTechnicalBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  return buildBlueprint({
    key: "deep-technical",
    roleId: input.roleId,
    mode: "DEEP_TECHNICAL",
    skills: input.skills,
    version: input.version,
    difficulty: 4,
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: true, preferCodeGrounded: true, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 50, perQuestionSoftLimitSeconds: 240 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 3 },
      evaluationConfig: {
        dimensions: ["technicalCorrectness", "reasoningQuality", "understanding", "depth", "application", "communicationClarity"],
        requireConsistencyCheck: true,
      },
    },
  });
}

/**
 * Phase 51 — gap verification: a narrow, targeted interview for skills the
 * Role Skill Gap Analysis has flagged as UNCERTAIN. `targetSkillIds` is
 * required and is forced to re-verify even if some prior evidence exists.
 */
export function skillVerificationBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  if (!input.targetSkillIds || input.targetSkillIds.length === 0) {
    throw new Error("skillVerificationBlueprint requires at least one targetSkillIds entry.");
  }
  const targeted = input.skills.filter((s) => input.targetSkillIds!.includes(s.skillId));
  if (targeted.length === 0) {
    throw new Error("None of targetSkillIds match the supplied role skills.");
  }
  return buildBlueprint({
    key: "skill-verification",
    roleId: input.roleId,
    mode: "SKILL_VERIFICATION",
    skills: targeted,
    version: input.version,
    forceVerificationSkillIds: input.targetSkillIds,
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: true, preferCodeGrounded: false, avoidRepeatingVerifiedSkills: false },
      timeConfig: { maxDurationMinutes: 15, perQuestionSoftLimitSeconds: 150 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: { dimensions: ["technicalCorrectness", "reasoningQuality", "application"], requireConsistencyCheck: false },
      completionRequirements: { minSkillsSufficientlyAssessed: "ALL_CORE", minQuestionsTotal: 1, maxQuestionsTotal: targeted.length * 4 },
    },
  });
}

/** Phase 18 — integrates with (does not replace) the existing Debugging Coach. */
export function debuggingInterviewBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  return buildBlueprint({
    key: "debugging-interview",
    roleId: input.roleId,
    mode: "DEBUGGING_INTERVIEW",
    skills: input.skills,
    version: input.version,
    evidenceSources: ["DEBUG_SESSION", "CODE_QUALITY_ANALYSIS", "REASONING_VERIFICATION"],
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: true, preferCodeGrounded: true, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 35, perQuestionSoftLimitSeconds: 210 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: { dimensions: ["reasoningQuality", "application", "depth"], requireConsistencyCheck: false },
    },
  });
}

/** Phase 19 — system-design scenarios, grounded in the student's actual architecture where available. */
export function architectureInterviewBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  return buildBlueprint({
    key: "architecture-interview",
    roleId: input.roleId,
    mode: "ARCHITECTURE_INTERVIEW",
    skills: input.skills,
    version: input.version,
    difficulty: 4,
    evidenceSources: ["PROJECT_SUBMISSION", "TECHNICAL_SKILL_SNAPSHOT", "SKILL_SIGNAL"],
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: true, preferCodeGrounded: false, avoidRepeatingVerifiedSkills: true },
      timeConfig: { maxDurationMinutes: 45, perQuestionSoftLimitSeconds: 240 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 3 },
      evaluationConfig: {
        dimensions: ["reasoningQuality", "application", "depth", "communicationClarity"],
        requireConsistencyCheck: false,
      },
    },
  });
}

/**
 * A short, pointed re-check triggered by a POTENTIAL_INCONSISTENCY or
 * UNCERTAIN evaluation earlier in the same or a prior session (Phase 14, 21).
 */
export function followUpVerificationBlueprint(input: ModeFactoryInput): InterviewBlueprint {
  if (!input.targetSkillIds || input.targetSkillIds.length === 0) {
    throw new Error("followUpVerificationBlueprint requires at least one targetSkillIds entry.");
  }
  const targeted = input.skills.filter((s) => input.targetSkillIds!.includes(s.skillId));
  return buildBlueprint({
    key: "follow-up-verification",
    roleId: input.roleId,
    mode: "FOLLOW_UP_VERIFICATION",
    skills: targeted.length > 0 ? targeted : input.skills.slice(0, 1),
    version: input.version,
    forceVerificationSkillIds: input.targetSkillIds,
    overrides: {
      questionStrategy: { preferApplied: true, preferScenario: false, preferCodeGrounded: true, avoidRepeatingVerifiedSkills: false },
      timeConfig: { maxDurationMinutes: 10, perQuestionSoftLimitSeconds: 150 },
      followUpConfig: { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
      evaluationConfig: { dimensions: ["technicalCorrectness", "understanding"], requireConsistencyCheck: true },
      completionRequirements: { minSkillsSufficientlyAssessed: 1, minQuestionsTotal: 1, maxQuestionsTotal: 3 },
    },
  });
}

export const BLUEPRINT_FACTORIES = {
  TECHNICAL_SCREENING: technicalScreeningBlueprint,
  PROJECT_DEFENSE: projectDefenseBlueprint,
  CODE_DEFENSE: codeDefenseBlueprint,
  DEEP_TECHNICAL: deepTechnicalBlueprint,
  SKILL_VERIFICATION: skillVerificationBlueprint,
  DEBUGGING_INTERVIEW: debuggingInterviewBlueprint,
  ARCHITECTURE_INTERVIEW: architectureInterviewBlueprint,
  FOLLOW_UP_VERIFICATION: followUpVerificationBlueprint,
} as const;
