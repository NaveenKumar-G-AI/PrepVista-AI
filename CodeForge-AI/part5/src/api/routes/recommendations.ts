import { Router } from 'express';
import { z } from 'zod';
import type { DB } from '../../db/client.js';
import { requireAuth, type AuthedRequest } from '../middleware/auth.js';
import { RecommendationService } from '../../recommendation/recommendationService.js';
import { ChallengeRepository } from '../../recommendation/candidateRetrieval.js';
import type { AIProvider } from '../../ai/types.js';

const NextQuerySchema = z.object({ language: z.enum(['javascript', 'python']).optional(), force: z.enum(['true', 'false']).optional() });

export function recommendationsRouter(db: DB, ai: AIProvider): Router {
  const router = Router();
  const service = new RecommendationService(db, ai);
  const challengeRepo = new ChallengeRepository(db);

  router.get('/next', requireAuth, async (req: AuthedRequest, res) => {
    const parsed = NextQuerySchema.safeParse(req.query);
    if (!parsed.success) { res.status(400).json({ error: 'Invalid query' }); return; }
    const studentId = req.studentId!;
    try {
      let rec = parsed.data.force === 'true' ? null : service.getPendingRecommendation(studentId);
      if (!rec) rec = await service.generateRecommendation(studentId, parsed.data.language);
      const challenge = challengeRepo.getById(rec.challengeId)!;
      res.json({
        recommendationId: rec.id, status: rec.status, gapType: rec.gapType, interventionType: rec.interventionType,
        learningObjective: rec.learningObjective, reason: rec.reason, rankingScore: rec.rankingScore,
        isRepetition: rec.isRepetition, isExploration: rec.isExploration,
        challenge: { id: challenge.id, title: challenge.title, prompt: challenge.prompt, difficultyLevel: challenge.difficultyLevel, languagesSupported: challenge.languagesSupported, functionName: challenge.functionName, harnessType: challenge.harnessType },
        // Traceability (Phase 44) — the evidence actually used to justify this pick, not a black box.
        evidenceSnapshot: rec.evidenceSnapshot,
      });
    } catch (err) {
      res.status(422).json({ error: err instanceof Error ? err.message : 'Could not generate a recommendation' });
    }
  });

  router.post('/:id/accept', requireAuth, (req: AuthedRequest, res) => {
    const rec = service.getRecommendation(req.params.id);
    if (!rec || rec.studentId !== req.studentId) { res.status(404).json({ error: 'Recommendation not found' }); return; } // ownership check (Phase 50)
    service.markAccepted(rec.id);
    res.json({ ok: true });
  });

  router.get('/history', requireAuth, (req: AuthedRequest, res) => {
    const history = service.getHistory(req.studentId!);
    res.json({ recommendations: history });
  });

  return router;
}
