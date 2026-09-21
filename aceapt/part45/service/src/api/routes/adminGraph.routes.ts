import { Router } from 'express';
import { adminGraphController } from '../controllers/adminGraph.controller';
import { requireAuth, requireRole } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/errorHandler';

export const adminGraphRouter = Router();

adminGraphRouter.use(requireAuth, requireRole('admin'));

adminGraphRouter.post('/skills', asyncHandler(adminGraphController.createSkill));
adminGraphRouter.patch('/skills/:skillId', asyncHandler(adminGraphController.updateSkill));
adminGraphRouter.post('/relationships', asyncHandler(adminGraphController.createRelationship));
adminGraphRouter.patch('/relationships/:relationshipId', asyncHandler(adminGraphController.updateRelationship));
adminGraphRouter.post('/validate', asyncHandler(adminGraphController.validate));
adminGraphRouter.post('/publish', asyncHandler(adminGraphController.publish));
adminGraphRouter.post('/versions/:versionId/rollback', asyncHandler(adminGraphController.rollback));
adminGraphRouter.get('/versions', asyncHandler(adminGraphController.listVersions));
adminGraphRouter.post('/ai-suggestions', asyncHandler(adminGraphController.suggestRelationships));
