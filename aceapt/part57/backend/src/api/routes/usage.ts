import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { SessionMode } from '../../domain/enums';
import * as performanceService from '../../services/performanceService';

export const usageRouter = Router();

const usageSchema = z.object({
  shortcutId: z.string().min(1),
  questionId: z.string().optional(),
  questionFamilyId: z.string().optional(),
  applied: z.boolean().default(true),
  correct: z.boolean(),
  responseTimeMs: z.number().int().nonnegative().optional(),
  baselineTimeMs: z.number().int().nonnegative().optional(),
  difficulty: z.string().optional(),
  novelty: z.string().optional(),
  mode: z.enum(SessionMode).default('PRACTICE'),
  timed: z.boolean().default(false),
  assisted: z.boolean().default(false),
});

/**
 * Sec. 41, 212, 217 - where the solving/practice pipeline would report back
 * "this student just used this shortcut, here's what happened". In a full
 * ACEAPT integration this would likely be called from the canonical Attempt
 * write path rather than exposed as its own public endpoint; it's a
 * separate route here because that pipeline doesn't exist in this build.
 */
usageRouter.post('/', validateBody(usageSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  const result = performanceService.recordUsage({ tenantId, studentId, ...req.body });
  res.status(201).json(result);
});
