import { z } from "zod";

const dimension = z.enum(["quant", "logical", "verbal", "probability", "data_interpretation"]);
const speedBand = z.enum(["SLOW", "DEVELOPING", "ON_PACE", "FAST"]);
const goalType = z.enum([
  "PLACEMENT_READINESS",
  "ASSESSMENT_PREPARATION",
  "SKILL_IMPROVEMENT",
  "PERFORMANCE_IMPROVEMENT",
  "SPEED_IMPROVEMENT",
  "ACCURACY_IMPROVEMENT",
  "OVERALL_APTITUDE",
  "CUSTOM",
]);
const deadlineType = z.enum(["EXACT_DATE", "DAYS_FROM_NOW", "NONE", "UNKNOWN"]);
const availableTime = z
  .object({
    monday: z.number().min(0).max(1440).optional(),
    tuesday: z.number().min(0).max(1440).optional(),
    wednesday: z.number().min(0).max(1440).optional(),
    thursday: z.number().min(0).max(1440).optional(),
    friday: z.number().min(0).max(1440).optional(),
    saturday: z.number().min(0).max(1440).optional(),
    sunday: z.number().min(0).max(1440).optional(),
  })
  .default({});

export const createGoalSchema = z
  .object({
    goalType,
    title: z.string().min(1).max(200).optional(),
    description: z.string().max(2000).optional(),
    deadlineType,
    deadlineDays: z.number().int().min(1).max(3650).optional(),
    targetDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    availableTime,
    explicitTargetCapability: z.record(dimension, z.number().min(0).max(100)).optional(),
    explicitTargetAccuracy: z.number().min(0).max(100).optional(),
    explicitTargetSpeedBand: speedBand.optional(),
    studentReportedWeakness: z.string().max(200).optional(),
    focusDimension: dimension.optional(),
    isPrimary: z.boolean().optional(),
  })
  .refine((v) => v.deadlineType !== "EXACT_DATE" || !!v.targetDate, {
    message: "targetDate is required when deadlineType is EXACT_DATE",
  })
  .refine((v) => v.deadlineType !== "DAYS_FROM_NOW" || typeof v.deadlineDays === "number", {
    message: "deadlineDays is required when deadlineType is DAYS_FROM_NOW",
  });

export const updateGoalSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  availableTime: availableTime.optional(),
  explicitTargetCapability: z.record(dimension, z.number().min(0).max(100)).optional(),
  explicitTargetAccuracy: z.number().min(0).max(100).optional(),
  explicitTargetSpeedBand: speedBand.optional(),
});

export const extractGoalSchema = z.object({
  text: z.string().min(1).max(2000),
});

export const listGoalsQuerySchema = z.object({
  status: z.union([z.enum(["ACTIVE", "PAUSED", "COMPLETED", "ABANDONED"]), z.array(z.string())]).optional(),
});
