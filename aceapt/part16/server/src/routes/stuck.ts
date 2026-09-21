import { Router, Request, Response } from 'express';
import { handleAttempt } from '../engine/orchestrator';
import { assertOwnsStudentId } from '../middleware/auth';
import { AttemptEvidence, StuckReasonCode, STUCK_REASON_LABELS } from '../types/evidence';

export const stuckRouter = Router();

stuckRouter.get('/reasons', (_req: Request, res: Response) => {
  res.json(
    Object.entries(STUCK_REASON_LABELS).map(([code, label]) => ({ code, label }))
  );
});

stuckRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as {
    studentId?: string;
    skillId?: string;
    microSkillId?: string;
    questionId?: string;
    reasonCode?: StuckReasonCode;
    prerequisiteSkillIds?: string[];
  };

  if (!assertOwnsStudentId(req, res, body.studentId)) return;
  if (!body.skillId || !body.questionId || !body.reasonCode) {
    res.status(400).json({ error: 'skillId, questionId and reasonCode are required.' });
    return;
  }
  if (!(body.reasonCode in STUCK_REASON_LABELS)) {
    res.status(400).json({ error: 'Unrecognized reasonCode.' });
    return;
  }

  // A self-report is treated as a real (failed) attempt so it enters the
  // same diagnostic/intervention pipeline as any other evidence — "I'm stuck"
  // is a strong, direct signal, not a side channel (Section 10).
  const evidence: AttemptEvidence = {
    studentId: body.studentId!,
    skillId: body.skillId,
    microSkillId: body.microSkillId,
    questionId: body.questionId,
    correct: false,
    responseTimeSeconds: 0,
    expectedTimeSeconds: 60,
    difficulty: 'medium',
    questionType: 'standard',
    hintsUsed: 0,
    prerequisiteSkillIds: body.prerequisiteSkillIds ?? [],
    selfReportedReasonCode: body.reasonCode,
  };

  const outcome = await handleAttempt(evidence);
  res.json(outcome);
});
