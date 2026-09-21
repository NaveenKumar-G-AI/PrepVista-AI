import { Router, Request, Response } from 'express';
import { store } from '../data/store';
import { buildRecoverySession, completeStep } from '../engine/recoverySession';
import { assertOwnsStudentId } from '../middleware/auth';
import { eventBus } from '../events/eventBus';
import { RootCause } from '../types/rootCause';

export const recoveryRouter = Router();

recoveryRouter.post('/', (req: Request, res: Response) => {
  const body = req.body as {
    studentId?: string;
    skillId?: string;
    microSkillId?: string;
    rootCause?: RootCause;
    triggeringPattern?: string;
  };

  if (!assertOwnsStudentId(req, res, body.studentId)) return;
  if (!body.skillId || !body.rootCause) {
    res.status(400).json({ error: 'skillId and rootCause are required.' });
    return;
  }

  const session = buildRecoverySession({
    studentId: body.studentId!,
    skillId: body.skillId,
    microSkillId: body.microSkillId,
    rootCause: body.rootCause,
    triggeringPattern: body.triggeringPattern ?? 'Repeated related errors detected on recent attempts.',
  });
  store.addRecoverySession(session);
  eventBus.emitEvent('RECOVERY_SESSION_STARTED', session.studentId, { sessionId: session.id }, `recovery_started:${session.id}`);
  res.json(session);
});

recoveryRouter.post('/:id/steps/:stepIndex/complete', (req: Request, res: Response) => {
  const session = store.getRecoverySession(req.params.id);
  if (!session || !assertOwnsStudentId(req, res, session.studentId)) return;

  const stepIndex = Number(req.params.stepIndex);
  const updated = completeStep(session, stepIndex);
  store.updateRecoverySession(session.id, updated);

  if (updated.status === 'completed') {
    eventBus.emitEvent('RECOVERY_SESSION_COMPLETED', session.studentId, { sessionId: session.id }, `recovery_completed:${session.id}`);
  }

  res.json(updated);
});

recoveryRouter.get('/:id', (req: Request, res: Response) => {
  const session = store.getRecoverySession(req.params.id);
  if (!session || !assertOwnsStudentId(req, res, session.studentId)) return;
  res.json(session);
});
