import { z } from 'zod';

export const scopeSchema = z.object({
  scopeType: z.enum(['OVERALL', 'DOMAIN', 'TOPIC', 'SKILL', 'SUBSKILL', 'DIFFICULTY', 'QUESTION_TYPE']),
  scopeId: z.string().min(1),
});

export const startSessionSchema = z.object({
  mode: z.enum(['FLUENCY', 'RECOGNITION', 'STRATEGY', 'CALCULATION', 'READING', 'BALANCED', 'DECISION', 'PACING', 'PLACEMENT_SIMULATION']),
  scope: scopeSchema,
  requestedPressure: z.enum(['NO_TIMER', 'SOFT_TIMER', 'TARGET_TIME', 'STRICT_TIME', 'PLACEMENT_SIMULATION']).optional(),
  guardrailAccuracy: z.number().min(0).max(1).optional(),
  goalId: z.string().optional(),
});

const questionContextSchema = z.object({
  questionId: z.string().min(1),
  skillId: z.string().min(1),
  subskillId: z.string().optional(),
  domain: z.string().optional(),
  topic: z.string().optional(),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD']),
  questionType: z.string().optional(),
  problemLength: z
    .object({
      wordCount: z.number().optional(),
      dataPoints: z.number().optional(),
      steps: z.number().optional(),
    })
    .optional(),
});

const stageTimingsSchema = z.object({
  readingMs: z.number().nonnegative().optional(),
  strategyMs: z.number().nonnegative().optional(),
  calculationMs: z.number().nonnegative().optional(),
  verificationMs: z.number().nonnegative().optional(),
});

export const submitAttemptSchema = z.object({
  question: questionContextSchema,
  responseTimeMs: z.number().positive(),
  correct: z.boolean(),
  independent: z.boolean(),
  hintLevel: z.number().int().nonnegative(),
  noveltyLevel: z.enum(['FAMILIAR', 'TRANSFER', 'NOVEL']).optional(),
  stage: stageTimingsSchema.optional(),
  decision: z.enum(['ATTEMPT', 'SKIP', 'RETURN_LATER']).optional(),
  confidenceRating: z.number().int().min(1).max(5).optional(),
  retryCount: z.number().int().nonnegative().optional(),
  idleMs: z.number().nonnegative().optional(),
  clientAttemptId: z.string().min(1),
});

export const startPlacementSimulationSchema = z.object({
  totalQuestions: z.number().int().positive(),
  timeBudgetMs: z.number().int().positive(),
  speedSessionId: z.string().optional(),
});

export const startPacingSessionSchema = startPlacementSimulationSchema;

export const cohortQuerySchema = z.object({
  studentIds: z.array(z.string()).min(1),
});
