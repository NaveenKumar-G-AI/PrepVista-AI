import { Router } from 'express';
import { studentGraphController } from '../controllers/studentGraph.controller';
import { requireAuth, requireSelfOrRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';

export const studentGraphRouter = Router();

studentGraphRouter.use(requireAuth);
// Section 61: a student may only read their OWN graph; admins and
// institution_viewer roles (already scoped elsewhere) may read any student's.
studentGraphRouter.use('/:studentId', requireSelfOrRole('studentId', 'admin', 'institution_viewer'));

studentGraphRouter.get('/:studentId/skill-graph', asyncHandler(studentGraphController.getGraph));
studentGraphRouter.get('/:studentId/skill-graph/gaps', asyncHandler(studentGraphController.getGaps));
studentGraphRouter.get('/:studentId/skill-graph/priorities', asyncHandler(studentGraphController.getPriorities));
studentGraphRouter.get('/:studentId/skill-graph/coverage', asyncHandler(studentGraphController.getCoverage));
studentGraphRouter.get('/:studentId/skill-graph/root-cause/:skillCode', asyncHandler(studentGraphController.getRootCause));
