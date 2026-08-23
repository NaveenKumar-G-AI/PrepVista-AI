import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../src/middleware/authenticate';
import * as authService from '../../services/auth/authService';
import * as sessionService from '../../services/sessions/sessionService';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const u = req.authUser!;
  res.json({ id: u.id, name: u.name, email: u.email, role: u.role, institutionId: u.institutionId, departmentId: u.departmentId });
});

router.get('/sessions', (req, res) => {
  const sessions = sessionService.listSessionsForUser(req.authUser!.id);
  res.json(sessions.map(s => ({
    id: s.id, userAgent: s.userAgent, createdAt: s.createdAt, lastActiveAt: s.lastActiveAt, isCurrent: s.id === req.sessionId,
  })));
});

router.post('/password/change', async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = z.object({ currentPassword: z.string(), newPassword: z.string().min(10) }).parse(req.body);
    await authService.changePassword(req.authUser!.id, req.authUser!.institutionId, currentPassword, newPassword, req.sessionId!);
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
