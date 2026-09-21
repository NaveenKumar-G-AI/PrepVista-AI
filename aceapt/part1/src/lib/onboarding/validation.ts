/**
 * Server-side validation for every step payload. The API route never trusts a client-supplied
 * shape without running it through here first (spec section 37). One schema per step id, keyed
 * so the PATCH /api/onboarding/step handler can look up the right one generically.
 */
import { z } from "zod";
import {
  PREPARATION_GOALS,
  PRIMARY_OBJECTIVES,
  TIMELINE_CATEGORIES,
  EXPERIENCE_LEVELS,
  PREVIOUS_PREPARATION_LEVELS,
  DIFFICULTY_AREAS,
  CONFIDENCE_LEVELS,
  AVAILABILITY_CATEGORIES,
  STUDY_TIMES,
  ASSISTANCE_MODES,
  DIFFICULTY_PREFERENCES,
  PAIN_POINTS,
  TARGET_SCORE_OPTIONS,
} from "./types";

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(new Date(v).getTime()), { message: "Invalid date" });

export const stepValueSchemas = {
  goal: z
    .object({
      preparationGoal: z.enum(PREPARATION_GOALS),
      preparationGoalOther: z.string().trim().max(200).optional().nullable(),
    })
    .refine((v) => v.preparationGoal !== "OTHER" || !!v.preparationGoalOther?.length, {
      message: "Please describe what you're preparing for",
      path: ["preparationGoalOther"],
    }),

  objective: z.object({
    primaryObjective: z.enum(PRIMARY_OBJECTIVES),
    secondaryObjectives: z.array(z.enum(PRIMARY_OBJECTIVES)).max(6).default([]),
  }),

  timeline: z.object({
    timelineCategory: z.enum(TIMELINE_CATEGORIES),
    targetDate: isoDate.optional().nullable(),
  }),

  experience: z.object({
    experienceLevel: z.enum(EXPERIENCE_LEVELS),
  }),

  "previous-preparation": z.object({
    previousPreparation: z.enum(PREVIOUS_PREPARATION_LEVELS),
  }),

  "previous-difficulties": z.object({
    previousDifficulties: z.array(z.enum(DIFFICULTY_AREAS)).max(DIFFICULTY_AREAS.length).default([]),
  }),

  "confidence-map": z.object({
    quantitative: z.enum(CONFIDENCE_LEVELS),
    logical: z.enum(CONFIDENCE_LEVELS),
    verbal: z.enum(CONFIDENCE_LEVELS),
    timePressure: z.enum(CONFIDENCE_LEVELS),
  }),

  "daily-availability": z.object({
    dailyAvailability: z.enum(AVAILABILITY_CATEGORIES),
  }),

  "study-schedule": z.object({
    preferredStudyTime: z.enum(STUDY_TIMES),
  }),

  "assistance-preference": z.object({
    preferredAssistanceModes: z.array(z.enum(ASSISTANCE_MODES)).min(1).max(ASSISTANCE_MODES.length),
  }),

  "difficulty-preference": z.object({
    initialDifficultyPreference: z.enum(DIFFICULTY_PREFERENCES),
  }),

  "pain-point": z.object({
    primaryPainPoint: z.enum(PAIN_POINTS),
    secondaryPainPoints: z.array(z.enum(PAIN_POINTS)).max(PAIN_POINTS.length).default([]),
  }),

  "target-score": z.object({
    targetScore: z.enum(TARGET_SCORE_OPTIONS),
  }),
} as const;

export type StepId = keyof typeof stepValueSchemas;

export function isKnownStep(id: string): id is StepId {
  return Object.prototype.hasOwnProperty.call(stepValueSchemas, id);
}

export const eventPayloadSchema = z.object({
  type: z.enum([
    "ONBOARDING_STARTED",
    "DIAGNOSTIC_STARTED",
    "ONBOARDING_ABANDONED",
  ]),
  metadata: z.record(z.string(), z.unknown()).optional(),
});
