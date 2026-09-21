// ============================================================================
// Phase 8 — Interview blueprint: schema, runtime validation, and a generic
// builder. Phase 4 requires ONE core engine driven by MANY blueprints — this
// file is that engine-facing contract. src/domain/blueprints/index.ts holds
// the eight mode-specific factories that all funnel through buildBlueprint().
// ============================================================================

import { z } from "zod";
import {
  INTERVIEW_MODES,
  SKILL_IMPORTANCE,
  EVIDENCE_SOURCE_TYPES,
  EVALUATION_DIMENSION_KEYS,
  asBlueprintId,
  type BlueprintId,
  type BlueprintSkillTarget,
  type InterviewBlueprint,
  type InterviewMode,
  type RoleId,
  type RoleSkillRequirement,
} from "./types.js";

// ---- Runtime schema (mirrors the TS interface in types.ts; keep in sync) --

const skillTargetSchema = z.object({
  skillId: z.string().min(1),
  importance: z.enum(SKILL_IMPORTANCE),
  minQuestions: z.number().int().min(0),
  maxQuestions: z.number().int().min(0),
  forceVerification: z.boolean().optional(),
}) satisfies z.ZodType<Omit<BlueprintSkillTarget, "skillId"> & { skillId: string }>;

export const blueprintSchema = z.object({
  id: z.string().min(1),
  key: z.string().min(1),
  roleId: z.string().min(1),
  mode: z.enum(INTERVIEW_MODES),
  difficulty: z.union([z.literal("ADAPTIVE"), z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  skills: z.array(skillTargetSchema).min(1, "A blueprint must target at least one skill."),
  evidenceSources: z.array(z.enum(EVIDENCE_SOURCE_TYPES)),
  questionStrategy: z.object({
    preferApplied: z.boolean(),
    preferScenario: z.boolean(),
    preferCodeGrounded: z.boolean(),
    avoidRepeatingVerifiedSkills: z.boolean(),
  }),
  timeConfig: z.object({
    maxDurationMinutes: z.number().positive(),
    perQuestionSoftLimitSeconds: z.number().positive(),
  }),
  followUpConfig: z.object({
    adaptiveEnabled: z.boolean(),
    maxFollowUpDepthPerSkill: z.number().int().min(0).max(10),
  }),
  evaluationConfig: z.object({
    dimensions: z.array(z.enum(EVALUATION_DIMENSION_KEYS)).min(1),
    requireConsistencyCheck: z.boolean(),
  }),
  completionRequirements: z.object({
    minSkillsSufficientlyAssessed: z.union([z.number().int().min(0), z.literal("ALL_CORE")]),
    minQuestionsTotal: z.number().int().min(1),
    maxQuestionsTotal: z.number().int().min(1),
  }),
  version: z.string().min(1),
});

export type BlueprintValidationResult =
  | { ok: true; blueprint: InterviewBlueprint }
  | { ok: false; errors: string[] };

/** Runtime guard — every blueprint crossing a process boundary (API, DB, queue) goes through this. */
export function validateBlueprint(candidate: unknown): BlueprintValidationResult {
  const result = blueprintSchema.safeParse(candidate);
  if (!result.success) {
    return { ok: false, errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }

  const blueprint = result.data as InterviewBlueprint;
  const structuralErrors: string[] = [];

  for (const skill of blueprint.skills) {
    if (skill.minQuestions > skill.maxQuestions) {
      structuralErrors.push(`skill ${skill.skillId}: minQuestions (${skill.minQuestions}) exceeds maxQuestions (${skill.maxQuestions})`);
    }
  }
  if (blueprint.completionRequirements.minQuestionsTotal > blueprint.completionRequirements.maxQuestionsTotal) {
    structuralErrors.push("completionRequirements: minQuestionsTotal exceeds maxQuestionsTotal");
  }
  if (
    typeof blueprint.completionRequirements.minSkillsSufficientlyAssessed === "number" &&
    blueprint.completionRequirements.minSkillsSufficientlyAssessed > blueprint.skills.length
  ) {
    structuralErrors.push("completionRequirements: minSkillsSufficientlyAssessed exceeds the number of targeted skills");
  }

  if (structuralErrors.length > 0) return { ok: false, errors: structuralErrors };
  return { ok: true, blueprint };
}

// ---- Generic builder --------------------------------------------------------

/** Per-importance defaults for how many times a skill may be probed (Phase 22 bound). */
const QUESTION_BOUNDS_BY_IMPORTANCE: Record<(typeof SKILL_IMPORTANCE)[number], { min: number; max: number }> = {
  CORE: { min: 2, max: 4 },
  IMPORTANT: { min: 1, max: 3 },
  SUPPORTING: { min: 1, max: 2 },
  OPTIONAL: { min: 0, max: 1 },
};

export interface BuildBlueprintInput {
  key: string;
  roleId: RoleId;
  mode: InterviewMode;
  skills: RoleSkillRequirement[];
  version: string;
  difficulty?: InterviewBlueprint["difficulty"];
  evidenceSources?: InterviewBlueprint["evidenceSources"];
  overrides?: Partial<
    Pick<InterviewBlueprint, "questionStrategy" | "timeConfig" | "followUpConfig" | "evaluationConfig" | "completionRequirements">
  >;
  /** Skill ids that must be re-verified even if already VERIFIED (Phase 51). */
  forceVerificationSkillIds?: string[];
}

/**
 * The single construction path every mode factory uses. This is what makes
 * "one core engine, many blueprints" true in code rather than just in intent:
 * no mode factory is allowed to hand-assemble an InterviewBlueprint directly.
 */
export function buildBlueprint(input: BuildBlueprintInput): InterviewBlueprint {
  const forceSet = new Set(input.forceVerificationSkillIds ?? []);

  const skills: BlueprintSkillTarget[] = input.skills.map((req) => {
    const bounds = QUESTION_BOUNDS_BY_IMPORTANCE[req.importance];
    return {
      skillId: req.skillId,
      importance: req.importance,
      minQuestions: bounds.min,
      maxQuestions: bounds.max,
      forceVerification: forceSet.has(req.skillId) || undefined,
    };
  });

  const coreCount = skills.filter((s) => s.importance === "CORE").length;

  const blueprint: InterviewBlueprint = {
    id: asBlueprintId(`bp_${input.key}_${input.version}`) as BlueprintId,
    key: input.key,
    roleId: input.roleId,
    mode: input.mode,
    difficulty: input.difficulty ?? "ADAPTIVE",
    skills,
    evidenceSources: input.evidenceSources ?? [
      "CODING_CHALLENGE",
      "PROJECT_SUBMISSION",
      "CODE_QUALITY_ANALYSIS",
      "COMPLEXITY_ANALYSIS",
      "TECHNICAL_SKILL_SNAPSHOT",
      "SKILL_SIGNAL",
    ],
    questionStrategy: input.overrides?.questionStrategy ?? {
      preferApplied: true,
      preferScenario: false,
      preferCodeGrounded: false,
      avoidRepeatingVerifiedSkills: true,
    },
    timeConfig: input.overrides?.timeConfig ?? { maxDurationMinutes: 45, perQuestionSoftLimitSeconds: 180 },
    followUpConfig: input.overrides?.followUpConfig ?? { adaptiveEnabled: true, maxFollowUpDepthPerSkill: 2 },
    evaluationConfig: input.overrides?.evaluationConfig ?? {
      dimensions: ["technicalCorrectness", "reasoningQuality", "understanding", "communicationClarity"],
      requireConsistencyCheck: false,
    },
    completionRequirements: input.overrides?.completionRequirements ?? {
      minSkillsSufficientlyAssessed: coreCount > 0 ? "ALL_CORE" : Math.min(1, skills.length),
      minQuestionsTotal: Math.max(1, skills.reduce((sum, s) => sum + s.minQuestions, 0)),
      maxQuestionsTotal: skills.reduce((sum, s) => sum + s.maxQuestions, 0) || 1,
    },
    version: input.version,
  };

  const validation = validateBlueprint(blueprint);
  if (!validation.ok) {
    // A blueprint produced by the builder itself failing validation is a
    // programming error in a mode factory, not a user input problem — fail
    // loudly rather than silently persisting an invalid config (Phase 63).
    throw new Error(`buildBlueprint produced an invalid blueprint for "${input.key}": ${validation.errors.join("; ")}`);
  }

  return blueprint;
}
