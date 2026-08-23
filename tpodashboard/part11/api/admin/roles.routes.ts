import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import * as roleService from '../../services/roles/roleService';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('roles.read'), (req, res) => {
  const roles = roleService.listRoles(req.authUser!.institutionId);
  res.json(roles.map(r => ({ id: r.id, name: r.name, rank: r.rank, isSystem: r.isSystem, userCount: r.userCount, permissions: r.permissions })));
});

const createRoleSchema = z.object({ name: z.string().min(2), rank: z.number().int().min(1).max(99), permissionKeys: z.array(z.string()) });

router.post('/', requirePermission('roles.write'), (req, res, next) => {
  try {
    const input = createRoleSchema.parse(req.body);
    const role = roleService.createCustomRole(req.authUser!, input);
    res.status(201).json(role);
  } catch (err) { next(err); }
});

export default router;
