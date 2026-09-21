import { Router } from 'express';
import { requireParam } from '../util';
import { z } from 'zod';
import type { AuthedRequest } from '../middleware/auth';
import { validateBody } from '../middleware/validateRequest';
import { StrategyType } from '../../domain/enums';
import * as discoveryService from '../../services/discoveryService';

export const discoveriesRouter = Router();

discoveriesRouter.get('/mine', (req: AuthedRequest, res) => {
  const { studentId } = req.auth!;
  res.json(discoveryService.listDiscoveries(studentId));
});

const evidenceSchema = z.object({
  candidateStrategyType: z.enum(StrategyType),
  questionFamilyId: z.string().nullable().default(null),
  methodSignature: z.string().min(1).max(200),
  success: z.boolean(),
  questionId: z.string().optional(),
});

/**
 * Sec. 71-75 - normally called by the practice pipeline whenever a student
 * solves a question with a method that doesn't match a known shortcut.
 * Exposed directly here since that pipeline doesn't exist in this build.
 */
discoveriesRouter.post('/evidence', validateBody(evidenceSchema), (req: AuthedRequest, res) => {
  const { tenantId, studentId } = req.auth!;
  res.status(201).json(discoveryService.recordDiscoveryEvidence({ tenantId, studentId, ...req.body }));
});

discoveriesRouter.post('/:id/dismiss', (req: AuthedRequest, res) => {
  discoveryService.dismissDiscovery(requireParam(req, 'id'));
  res.status(204).end();
});
