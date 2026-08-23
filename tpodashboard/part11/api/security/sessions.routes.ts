import { Router } from 'express';
import { authenticate } from '../../src/middleware/authenticate';
import * as sessionService from '../../services/sessions/sessionService';
import { recordAudit } from '../../services/audit/auditService';
import { Errors } from '../../src/lib/errors';

const router = Router();
router.use(authenticate);

router.get('/', (req, res) => {
  const sessions = sessionService.listSessionsForUser(req.authUser!.id);
  res.json(sessions.map(s => ({
    id: s.id, userAgent: s.userAgent, ipAddress: s.ipAddress,
    createdAt: s.createdAt, lastActiveAt: s.lastActiveAt, expiresAt: s.expiresAt,
    isCurrent: s.id === req.sessionId,
  })));
});

router.delete('/:id', (req, res, next) => {
  try {
    const target = sessionService.listSessionsForUser(req.authUser!.id).find(s => s.id === req.params.id);
    if (!target) throw Errors.notFound('Session not found.');
    sessionService.revokeSession(target.id);
    recordAudit({
      institutionId: req.authUser!.institutionId, actorId: req.authUser!.id,
      action: 'session.revoked', entityType: 'Session', entityId: target.id,
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

export default router;
