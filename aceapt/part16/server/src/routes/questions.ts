import { Router, Request, Response } from 'express';
import { generateTargetedQuestion } from '../engine/questionGenerator';
import { routeToExamSimulation } from '../integration/otherFeatureClients';
import { assertOwnsStudentId } from '../middleware/auth';

export const questionsRouter = Router();

questionsRouter.get('/targeted', (req: Request, res: Response) => {
  const microSkillId = req.query.microSkillId as string | undefined;
  const difficulty = (req.query.difficulty as string | undefined) ?? 'any';
  const seen = typeof req.query.seen === 'string' ? req.query.seen.split(',').filter(Boolean) : [];

  if (!microSkillId) {
    res.status(400).json({ error: 'microSkillId is required.' });
    return;
  }

  const question = generateTargetedQuestion(microSkillId, difficulty as never, seen);
  if (!question) {
    res.status(404).json({ error: 'No question template available for this micro-skill/difficulty.' });
    return;
  }
  res.json(question);
});

export const examSimulationRouter = Router();

examSimulationRouter.post('/', async (req: Request, res: Response) => {
  const body = req.body as { studentId?: string; skillIds?: string[] };
  if (!assertOwnsStudentId(req, res, body.studentId)) return;
  if (!body.skillIds || body.skillIds.length === 0) {
    res.status(400).json({ error: 'skillIds is required.' });
    return;
  }
  const result = await routeToExamSimulation(body.studentId!, body.skillIds);
  res.json(result);
});
