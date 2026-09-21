import { Router } from 'express';
import type { DB } from '../../db/client.js';
import { requireAuth } from '../middleware/auth.js';
import { ChallengeRepository } from '../../recommendation/candidateRetrieval.js';

export function challengesRouter(db: DB): Router {
  const router = Router();
  const repo = new ChallengeRepository(db);

  router.get('/:id', requireAuth, (req, res) => {
    const challenge = repo.getById(req.params.id);
    if (!challenge) { res.status(404).json({ error: 'Challenge not found' }); return; }
    const lang = challenge.languagesSupported[0];
    const visibleTestCases = repo.getTestCases(challenge.id, lang).filter((tc) => !tc.isHidden);
    res.json({
      id: challenge.id, title: challenge.title, prompt: challenge.prompt, difficultyLevel: challenge.difficultyLevel,
      languagesSupported: challenge.languagesSupported, functionName: challenge.functionName, harnessType: challenge.harnessType,
      contextType: challenge.contextType,
      // Only non-hidden inputs shown, and NEVER expected outputs — students see what a test checks, not the answer key.
      sampleTests: visibleTestCases.map((tc) => ({ id: tc.id, category: tc.category, input: tc.input })),
    });
  });

  return router;
}
