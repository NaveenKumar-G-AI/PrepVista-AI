import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { SessionMode } from '../../domain/enums';
import * as libraryService from '../../services/libraryService';

export const recommendationsRouter = Router();

const questionContextSchema = z.object({
  questionId: z.string().optional(),
  questionFamilyId: z.string().optional(),
  skillId: z.string().optional(),
  difficulty: z.string().optional(),
  novelty: z.string().optional(),
  answerType: z.string().optional(),
  hasOptions: z.boolean().optional(),
  attributes: z.record(z.unknown()).optional(),
});

const recommendSchema = z.object({
  context: questionContextSchema,
  mode: z.enum(SessionMode),
  assessmentAllowsStrategyAssistance: z.boolean().default(false),
  standardMethodStats: z.object({ accuracy: z.number(), medianTimeMs: z.number() }).optional(),
});

/** Sec. 34-40, 89, 94-98, 178, 234 - "getRecommendedStrategy". */
recommendationsRouter.post('/strategy', validateBody(recommendSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  const outcome = libraryService.getRecommendedStrategy({
    tenantId,
    studentId,
    context: req.body.context,
    mode: req.body.mode,
    assessmentAllowsStrategyAssistance: req.body.assessmentAllowsStrategyAssistance,
    standardMethodStats: req.body.standardMethodStats,
  });
  res.json(outcome);
});
