import { Router } from 'express';
import { skillGraphController } from '../controllers/skillGraph.controller';
import { requireAuth } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';

export const skillGraphRouter = Router();

skillGraphRouter.use(requireAuth);

skillGraphRouter.get('/', asyncHandler(skillGraphController.list));
skillGraphRouter.get('/:skillId', asyncHandler(skillGraphController.get));
skillGraphRouter.get('/:skillId/prerequisites', asyncHandler(skillGraphController.prerequisites));
skillGraphRouter.get('/:skillId/dependents', asyncHandler(skillGraphController.dependents));
skillGraphRouter.get('/:skillId/related', asyncHandler(skillGraphController.related));
skillGraphRouter.get('/:skillId/path/:targetSkillId', asyncHandler(skillGraphController.path));
