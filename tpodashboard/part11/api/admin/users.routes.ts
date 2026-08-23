import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../src/middleware/authenticate';
import { requirePermission } from '../../services/authorization/rbac';
import * as userService from '../../services/users/userService';
import * as sessionService from '../../services/sessions/sessionService';
import { pushDevOutbox } from '../../services/system/systemService';
import { recordAudit } from '../../services/audit/auditService';

const router = Router();
router.use(authenticate);

router.get('/', requirePermission('users.read'), (req, res) => {
  const users = userService.listUsers(req.authUser!);
  res.json(users.map(u => ({
    id: u.id, name: u.name, email: u.email, role: u.roleName, department: u.departmentName,
    status: u.status, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
  })));
});

const inviteSchema = z.object({
  email: z.string().email(), name: z.string().min(1), roleName: z.string(), departmentId: z.string().optional(),
});

router.post('/invite', requirePermission('users.write'), (req, res, next) => {
  try {
    const input = inviteSchema.parse(req.body);
    const { user, devToken } = userService.inviteUser(req.authUser!, input);
    pushDevOutbox(user.email, "You're invited to PrepVista",
      `Use this token to activate your account: ${devToken}`);
    res.status(201).json({ id: user.id, email: user.email, status: user.status });
  } catch (err) { next(err); }
});

router.patch('/:id/role', requirePermission('roles.write'), (req, res, next) => {
  try {
    const { roleName } = z.object({ roleName: z.string() }).parse(req.body);
    const updated = userService.changeUserRole(req.authUser!, req.params.id, roleName);
    res.json({ id: updated.id, roleId: updated.roleId });
  } catch (err) { next(err); }
});

router.patch('/:id/status', requirePermission('users.write'), (req, res, next) => {
  try {
    const { status } = z.object({ status: z.enum(['ACTIVE', 'SUSPENDED', 'DEACTIVATED']) }).parse(req.body);
    const updated = userService.changeUserStatus(req.authUser!, req.params.id, status);
    res.json({ id: updated.id, status: updated.status });
  } catch (err) { next(err); }
});

router.delete('/:id/sessions', requirePermission('sessions.revoke'), (req, res) => {
  const count = sessionService.revokeAllForUser(req.params.id);
  recordAudit({
    institutionId: req.authUser!.institutionId, actorId: req.authUser!.id,
    action: 'user.sessions_force_revoked', entityType: 'User', entityId: req.params.id,
    newState: { sessionsRevoked: count },
  });
  res.status(204).send();
});

export default router;
