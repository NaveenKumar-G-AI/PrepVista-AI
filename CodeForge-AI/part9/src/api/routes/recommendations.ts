import { Router } from 'express';
import { RecommendationService } from '../../services/RecommendationService.js';
import type { AuthedRequest } from '../middleware/auth.js';

const router = Router();
const recommendationService = new RecommendationService();

// GET /recommendations/next-action?role=software_engineer
// Returns exactly one primary recommendation and up to 3 secondary ones —
// PHASE 64: never the full ranked list.
router.get('/next-action', async (req: AuthedRequest, res) => {
  const roleKey = (req.query.role as string) ?? 'software_engineer';
  const recommendations = await recommendationService.getNextActions(req.studentId!, roleKey);
  res.json({ recommendations });
});

export default router;
