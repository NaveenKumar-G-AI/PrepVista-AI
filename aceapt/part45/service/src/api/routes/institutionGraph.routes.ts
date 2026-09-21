import { Router } from 'express';
import { cohortGraphController } from '../controllers/cohortGraph.controller';
import { requireAuth, requireInstitutionMatch } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';

export const institutionGraphRouter = Router();

institutionGraphRouter.use(requireAuth);
institutionGraphRouter.get('/:institutionId/skill-graph/cohort', requireInstitutionMatch('institutionId'), asyncHandler(cohortGraphController.getCohort));
