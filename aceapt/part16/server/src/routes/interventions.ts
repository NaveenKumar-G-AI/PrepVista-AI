import crypto from 'node:crypto';
import { Router, Request, Response } from 'express';
import { store } from '../data/store';
import { startIntervention, reassessIntervention } from '../engine/orchestrator';
import { getHint } from '../engine/hintEngine';
import { explainDifferently, ExplanationStyle } from '../engine/explainDifferently';
import { deconstructError } from '../engine/errorDeconstruction';
import { assertOwnsStudentId } from '../middleware/auth';
import { AttemptEvidence } from '../types/evidence';
import { ROOT_CAUSE_LABELS } from '../types/rootCause';
import { PROFIT_LOSS_MICRO_SKILLS } from '../data/skillGraph';

export const interventionsRouter = Router();

function microSkillLabel(id?: string): string | undefined {
  return PROFIT_LOSS_MICRO_SKILLS.find((m) => m.id === id)?.label;
}

interventionsRouter.post('/:id/start', (req: Request, res: Response) => {
  const existing = store.getIntervention(req.params.id);
  if (!existing || !assertOwnsStudentId(req, res, existing.studentId)) return;
  const updated = startIntervention(req.params.id);
  res.json(updated);
});

interventionsRouter.post('/:id/reassess', async (req: Request, res: Response) => {
  const existing = store.getIntervention(req.params.id);
  if (!existing || !assertOwnsStudentId(req, res, existing.studentId)) return;

  const body = req.body as Partial<AttemptEvidence> & { transferCorrect?: boolean };
  const evidence: AttemptEvidence = {
    studentId: existing.studentId,
    skillId: existing.skillId,
    microSkillId: existing.microSkillId,
    questionId: body.questionId ?? `reassess_${req.params.id}`,
    correct: Boolean(body.correct),
    responseTimeSeconds: body.responseTimeSeconds ?? 60,
    expectedTimeSeconds: body.expectedTimeSeconds ?? 60,
    difficulty: body.difficulty ?? 'medium',
    questionType: body.questionType ?? 'standard',
    hintsUsed: body.hintsUsed ?? 0,
    solutionPath: body.solutionPath,
    prerequisiteSkillIds: body.prerequisiteSkillIds ?? [],
  };

  const transferCheck = typeof body.transferCorrect === 'boolean' ? { correct: body.transferCorrect } : undefined;
  const outcome = await reassessIntervention(req.params.id, evidence, transferCheck);
  if (!outcome) {
    res.status(404).json({ error: 'Intervention not found.' });
    return;
  }
  res.json(outcome);
});

interventionsRouter.post('/:id/hint', async (req: Request, res: Response) => {
  const existing = store.getIntervention(req.params.id);
  if (!existing || !assertOwnsStudentId(req, res, existing.studentId)) return;

  const nextLevel = store.countHints(req.params.id) + 1;
  const result = await getHint(nextLevel, existing.skillId, microSkillLabel(existing.microSkillId));
  store.addHintAttempt({
    id: crypto.randomUUID(),
    interventionId: req.params.id,
    studentId: existing.studentId,
    level: result.level,
    createdAt: new Date().toISOString(),
  });
  res.json(result);
});

interventionsRouter.post('/:id/explain-differently', async (req: Request, res: Response) => {
  const existing = store.getIntervention(req.params.id);
  if (!existing || !assertOwnsStudentId(req, res, existing.studentId)) return;

  const previousStyles = (req.body?.previousStyles ?? []) as ExplanationStyle[];
  const result = await explainDifferently({
    skillLabel: existing.skillId,
    microSkillLabel: microSkillLabel(existing.microSkillId),
    rootCauseLabel: ROOT_CAUSE_LABELS[existing.rootCause],
    previousStyles,
  });
  res.json(result);
});

interventionsRouter.post('/:id/error-deconstruction', async (req: Request, res: Response) => {
  const existing = store.getIntervention(req.params.id);
  if (!existing || !assertOwnsStudentId(req, res, existing.studentId)) return;

  const solutionPath = req.body?.solutionPath;
  const result = await deconstructError(solutionPath, existing.rootCause);
  if (!result) {
    res.status(200).json({ available: false, reason: 'No solution-step evidence was captured for this attempt.' });
    return;
  }
  res.json({ available: true, ...result });
});
