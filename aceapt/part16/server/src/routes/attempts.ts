import { Router, Request, Response } from 'express';
import { handleAttempt } from '../engine/orchestrator';
import { assertOwnsStudentId } from '../middleware/auth';
import { AttemptEvidence } from '../types/evidence';

export const attemptsRouter = Router();

attemptsRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as Partial<AttemptEvidence>;

  if (!assertOwnsStudentId(req, res, body.studentId)) return;
  if (!body.skillId || !body.questionId || typeof body.correct !== 'boolean') {
    res.status(400).json({ error: 'skillId, questionId and correct are required.' });
    return;
  }

  const evidence: AttemptEvidence = {
    studentId: body.studentId!,
    skillId: body.skillId,
    microSkillId: body.microSkillId,
    questionId: body.questionId,
    correct: body.correct,
    responseTimeSeconds: body.responseTimeSeconds ?? 60,
    expectedTimeSeconds: body.expectedTimeSeconds ?? 60,
    difficulty: body.difficulty ?? 'medium',
    questionType: body.questionType ?? 'standard',
    hintsUsed: body.hintsUsed ?? 0,
    solutionPath: body.solutionPath,
    prerequisiteSkillIds: body.prerequisiteSkillIds ?? [],
    selfReportedReasonCode: body.selfReportedReasonCode,
  };

  const outcome = await handleAttempt(evidence);
  res.json(outcome);
});
