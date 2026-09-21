import { Router } from 'express';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { TrainingActivityType } from '../../domain/enums';
import * as trainingService from '../../services/trainingService';

export const trainingRouter = Router();

const startSchema = z.object({
  activityType: z.enum(TrainingActivityType),
  shortcutId: z.string().min(1),
});

trainingRouter.post('/start', validateBody(startSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.json(trainingService.startTraining({ tenantId, studentId, ...req.body }));
});

const submitSchema = z.object({
  activityType: z.enum(TrainingActivityType),
  shortcutId: z.string().nullable(),
  promptRef: z.string(),
  response: z.unknown(),
  correct: z.boolean(),
  responseTimeMs: z.number().optional(),
});

trainingRouter.post('/submit', validateBody(submitSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.json(trainingService.submitTraining({ tenantId, studentId, ...req.body }));
});
