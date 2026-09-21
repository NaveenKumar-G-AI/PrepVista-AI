import { z } from 'zod';

export const startVerificationSchema = z.object({
  targetId: z.string().uuid(),
});

export const recordResponseSchema = z.object({
  sessionId: z.string().uuid(),
  questionIndex: z.number().int().min(0),
  capability: z.string().min(1),
  difficulty: z.enum(['EASY', 'MEDIUM', 'HARD', 'TARGET']),
  novelty: z.enum(['FAMILIAR', 'RELATED', 'NOVEL', 'HIGHLY_NOVEL']),
  isCorrect: z.boolean(),
  timeTakenMs: z.number().int().min(0),
  expectedTimeMs: z.number().int().min(0),
  skipped: z.boolean().default(false),
  changedAnswer: z.boolean().default(false),
  stalled: z.boolean().default(false),
});

export const completeVerificationSchema = z.object({
  sessionId: z.string().uuid(),
});

export const recalculateSchema = z.object({
  targetId: z.string().uuid(),
  capability: z.string().min(1),
});
