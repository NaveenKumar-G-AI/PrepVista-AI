import { Router } from 'express';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import * as userRepo from '../../db/repositories/userRepo';
import * as roleRepo from '../../db/repositories/roleRepo';
import { listPermissionKeysForRole } from '../../db/repositories/permissionRepo';
import { getAllowedAITools, getAIContextScope, getAIActionPolicy } from '../../services/ai-governance/aiGovernanceService';
import { Errors } from '../../src/lib/errors';
import { AuthUser } from '../../src/types/authUser';

const router = Router();
router.use(authenticate, requirePermission('settings.read'));

// Inspection endpoint: "if an AI acted on this user's behalf right now, what could it touch?"
router.get('/:userId', (req, res, next) => {
  try {
    const target = userRepo.findUserById(req.params.userId);
    if (!target || target.institutionId !== req.authUser!.institutionId) throw Errors.notFound('User not found.');
    const role = roleRepo.findRoleById(target.roleId)!;
    const shape: AuthUser = {
      id: target.id, institutionId: target.institutionId, departmentId: target.departmentId,
      email: target.email, name: target.name, role: role.name, rank: role.rank,
      permissions: listPermissionKeysForRole(role.id),
    };
    res.json({
      allowedTools: getAllowedAITools(shape),
      contextScope: getAIContextScope(shape),
      actionPolicy: getAIActionPolicy(shape),
    });
  } catch (err) { next(err); }
});

export default router;
