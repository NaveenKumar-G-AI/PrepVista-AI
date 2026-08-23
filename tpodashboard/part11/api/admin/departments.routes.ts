import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import * as departmentRepo from '../../db/repositories/departmentRepo';
import { recordAudit } from '../../services/audit/auditService';
import { Errors } from '../../src/lib/errors';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('settings.read'), (req, res) => {
  res.json(departmentRepo.listDepartments(req.authUser!.institutionId));
});

router.post('/', requirePermission('settings.write'), (req, res, next) => {
  try {
    const { name, code } = z.object({ name: z.string().min(1), code: z.string().min(1) }).parse(req.body);
    const dept = departmentRepo.createDepartment({ institutionId: req.authUser!.institutionId, name, code });
    recordAudit({
      institutionId: req.authUser!.institutionId, actorId: req.authUser!.id, action: 'department.created',
      entityType: 'Department', entityId: dept.id, newState: { name, code },
    });
    res.status(201).json(dept);
  } catch (err) { next(err); }
});

router.patch('/:id/active', requirePermission('settings.write'), (req, res, next) => {
  try {
    const { active } = z.object({ active: z.boolean() }).parse(req.body);
    const dept = departmentRepo.findDepartmentById(req.params.id);
    if (!dept || dept.institutionId !== req.authUser!.institutionId) throw Errors.notFound('Department not found.');
    const updated = departmentRepo.setDepartmentActive(dept.id, active);
    recordAudit({
      institutionId: req.authUser!.institutionId, actorId: req.authUser!.id, action: 'department.status_changed',
      entityType: 'Department', entityId: dept.id, oldState: { active: dept.active }, newState: { active },
    });
    res.json(updated);
  } catch (err) { next(err); }
});

export default router;
