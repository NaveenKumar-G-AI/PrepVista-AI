// ============================================================================
// Request validation. Every route parses its input through one of these
// before calling an orchestration use case — orchestration functions trust
// their inputs are well-typed; this file is what makes that trust safe at
// the process boundary.
// ============================================================================

import { z } from "zod";
import { INTERVIEW_MODES } from "../domain/types.js";

export const createInterviewSchema = z.object({
  studentId: z.string().min(1),
  roleId: z.string().min(1),
  mode: z.enum(INTERVIEW_MODES),
  targetSkillIds: z.array(z.string().min(1)).optional(),
});

export const createGapVerificationInterviewSchema = z.object({
  studentId: z.string().min(1),
  roleId: z.string().min(1),
  maxSkills: z.number().int().positive().max(10).optional(),
});

export const cancelSessionSchema = z.object({
  reason: z.string().min(1).max(500),
});

export const submitResponseSchema = z.object({
  questionId: z.string().min(1),
  content: z.string().max(20_000), // empty string is valid — represents "no answer given" (Phase 27)
  modality: z.enum(["TEXT", "VOICE"]),
  idempotencyKey: z.string().min(1).max(200),
});

export const institutionalReportQuerySchema = z.object({
  roleId: z.string().min(1),
  studentIds: z
    .string()
    .min(1)
    .transform((s) => s.split(",").map((id) => id.trim()).filter(Boolean)),
});
