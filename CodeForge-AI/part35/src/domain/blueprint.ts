import { randomUUID } from "node:crypto";
import type {
  ConfidenceBand,
  DifficultyLevel,
  EvaluationDimension,
  InterviewBlueprint,
  InterviewMode,
  RoleSkillRequirements,
} from "./types.js";
import { EVALUATION_DIMENSIONS } from "./types.js";

export const CURRENT_BLUEPRINT_VERSION = 1;

export interface BuildBlueprintInput {
  orgId: string;
  targetRole: string;
  mode: InterviewMode;
  createdBy: string;
  roleSkillRequirements: RoleSkillRequirements; // §9 — must come from the existing Role-Based Skill Model, never invented here
  /** Optional narrowing — e.g. a Gap Verification interview (§48) only targets the uncertain skills, not the whole role. */
  restrictToSkills?: string[];
  overrides?: Partial<{
    difficulty: DifficultyLevel | "ADAPTIVE";
    maxQuestions: number;
    maxDurationMinutes: number;
    sufficientEvidenceThreshold: ConfidenceBand;
    minQuestionsPerCoreSkill: number;
    dimensions: EvaluationDimension[];
  }>;
}

export class BlueprintValidationError extends Error {}

/**
 * §8 — build a structured, versioned, reproducible interview blueprint.
 * Deterministic given the same input: no randomness in the blueprint itself
 * (randomness belongs to question selection later, not to the plan).
 */
export function buildInterviewBlueprint(input: BuildBlueprintInput): InterviewBlueprint {
  if (!input.targetRole.trim()) {
    throw new BlueprintValidationError("targetRole is required");
  }
  if (input.roleSkillRequirements.role !== input.targetRole) {
    throw new BlueprintValidationError(
      `roleSkillRequirements is for role "${input.roleSkillRequirements.role}", not requested role "${input.targetRole}"`
    );
  }
  if (input.roleSkillRequirements.skills.length === 0) {
    throw new BlueprintValidationError(
      `Role "${input.targetRole}" returned zero skill requirements from the Role-Based Skill Model — refusing to build a blueprint with no target skills rather than inventing some`
    );
  }

  let targetSkills = input.roleSkillRequirements.skills;
  if (input.restrictToSkills && input.restrictToSkills.length > 0) {
    const restrict = new Set(input.restrictToSkills);
    targetSkills = targetSkills.filter((s) => restrict.has(s.skill));
    if (targetSkills.length === 0) {
      throw new BlueprintValidationError(
        "restrictToSkills matched none of the role's actual skill requirements"
      );
    }
  }

  const now = new Date().toISOString();

  return {
    id: randomUUID(),
    orgId: input.orgId,
    version: CURRENT_BLUEPRINT_VERSION,
    targetRole: input.targetRole,
    mode: input.mode,
    difficulty: input.overrides?.difficulty ?? "ADAPTIVE",
    targetSkills,
    evidenceSourcesUsed: [], // populated once evidence is actually collected (§10) — a blueprint alone doesn't know yet
    questionStrategy: {
      prioritizeUncertainty: true,
      diversityWindow: 3,
    },
    followUpStrategy: {
      maxDepthPerTopic: 5, // matches the 5-rung ladder in §27 (Definition..Failure Scenario)
      maxFollowUpsPerQuestion: 3,
    },
    coverageRules: {
      sufficientEvidenceThreshold: input.overrides?.sufficientEvidenceThreshold ?? "MODERATE",
      minQuestionsPerCoreSkill: input.overrides?.minQuestionsPerCoreSkill ?? 2,
    },
    evaluationRules: {
      dimensions: input.overrides?.dimensions ?? [...EVALUATION_DIMENSIONS],
    },
    timeConfig: {
      maxQuestions: input.overrides?.maxQuestions ?? 20,
      maxDurationMinutes: input.overrides?.maxDurationMinutes ?? 45,
    },
    createdBy: input.createdBy,
    createdAt: now,
  };
}

export function validateBlueprint(blueprint: InterviewBlueprint): string[] {
  const problems: string[] = [];
  if (blueprint.targetSkills.length === 0) problems.push("no target skills");
  if (blueprint.timeConfig.maxQuestions < 1) problems.push("maxQuestions must be >= 1");
  if (blueprint.followUpStrategy.maxDepthPerTopic < 1) problems.push("maxDepthPerTopic must be >= 1");
  if (blueprint.evaluationRules.dimensions.length === 0) problems.push("no evaluation dimensions configured");
  return problems;
}
