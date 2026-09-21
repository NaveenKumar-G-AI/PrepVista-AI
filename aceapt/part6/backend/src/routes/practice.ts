import { Router } from 'express';
import { z } from 'zod';
import { asyncRoute } from '../middleware/errorHandler';
import { feature5Adapter } from '../adapters/feature5Adapter';

export const practiceRouter = Router();

const completeSchema = z.object({
  accuracyPct: z.number().min(0).max(100),
  sampleSize: z.number().int().positive(),
});

/**
 * DEMO/DEV SHIM ONLY. In the real system, Feature 5 (Adaptive Practice) would
 * call back into Feature 6 itself once a student finishes a practice session
 * it created. Since Feature 5 does not exist yet, this endpoint lets a demo
 * (or the e2e script) simulate that callback so the practice-vs-assessment
 * gap and the reassess step of the loop can be shown end-to-end. This should
 * be removed once a real Feature 5 exists.
 */
practiceRouter.post(
  '/:id/complete',
  asyncRoute(async (req, res) => {
    const body = completeSchema.parse(req.body ?? {});
    await feature5Adapter.recordPracticeCompletion(req.params.id, body);
    res.json({ ok: true });
  })
);
