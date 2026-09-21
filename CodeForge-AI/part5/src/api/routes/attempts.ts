import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { processAttempt } from '../../pipeline/processAttempt.js';
import { toClientSafeResult } from '../../evaluation/evaluator.js';
import { ChallengeRepository } from '../../recommendation/candidateRetrieval.js';

const AttemptSchema = z.object({
  challengeId: z.string().min(1),
  language: z.enum(['javascript', 'python']),
  code: z.string().min(1).max(20000),
  clientAttemptId: z.string().min(1).max(200).optional(),
  assistanceUsed: z.enum(['NONE', 'HINT', 'SOLUTION_VIEWED']).optional(),
  recommendationId: z.string().min(1).optional(),
});

export function attemptsRouter(db: DB): Router {
  const router = Router();
  const challengeRepo = new ChallengeRepository(db);

  router.post('/', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = AttemptSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Invalid request body', details: parsed.error.flatten() });
      return;
    }
    try {
      // studentId ALWAYS comes from the verified token, never from the request body (Phase 50).
      const result = await processAttempt(db, { ...parsed.data, studentId: req.studentId! });
      const testCases = challengeRepo.getTestCases(parsed.data.challengeId, parsed.data.language);
      res.status(201).json({
        attemptId: result.attempt.id,
        idempotentReplay: result.idempotentReplay,
        evaluation: toClientSafeResult(result.evaluation, testCases), // hidden test detail stripped (Phase 18/50)
        diagnosis: result.diagnosis,
        updatedSkillStates: result.updatedStates,
      });
    } catch (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Failed to process attempt' });
    }
  });

  return router;
}
