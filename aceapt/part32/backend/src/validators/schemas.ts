import { z } from "zod";
import { CAPABILITIES } from "../config/rubrics.js";
import { ROLE_RUBRICS } from "../config/rubrics.js";

const capabilityIds = CAPABILITIES.map((c) => c.id) as [string, ...string[]];
const roleIds = ROLE_RUBRICS.map((r) => r.roleId) as [string, ...string[]];

export const setTargetRoleSchema = z.object({
  roleId: z.enum(roleIds, { errorMap: () => ({ message: "Unknown target role." }) }),
});

export const submitAssessmentAttemptSchema = z.object({
  capabilityId: z.enum(capabilityIds, { errorMap: () => ({ message: "Unknown capability." }) }),
  score: z.number().min(0, "Score must be at least 0.").max(100, "Score can't exceed 100."),
  source: z.string().min(1).max(60).optional().default("practice_set"),
});

export const completeRecommendationSchema = z.object({
  resultScore: z.number().min(0).max(100).optional(),
});

export const skipRecommendationSchema = z.object({
  reason: z.string().max(280).optional(),
});
