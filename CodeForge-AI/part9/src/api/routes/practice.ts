import { Router } from 'express';
import { PracticeService } from '../../services/PracticeService.js';
import type { AuthedRequest } from '../middleware/auth.js';

const router = Router();
const practiceService = new PracticeService();

// POST /practice/complete — the single entry point where a real submission
// (already validated by your execution/test engine) becomes evidence.
router.post('/complete', async (req: AuthedRequest, res) => {
  const body = req.body ?? {};
  const required = ['skillId', 'source', 'difficulty', 'passed', 'idempotencyKey'];
  const missing = required.filter((k) => body[k] === undefined);
  if (missing.length) return res.status(400).json({ error: `Missing fields: ${missing.join(', ')}` });

  const result = await practiceService.completePractice({
    studentId: req.studentId!,
    skillId: body.skillId,
    problemId: body.problemId ?? null,
    source: body.source,
    difficulty: body.difficulty,
    independent: body.independent ?? true,
    hintsUsed: body.hintsUsed ?? 0,
    solutionViewed: body.solutionViewed ?? false,
    isTransfer: body.isTransfer ?? false,
    timed: body.timed ?? false,
    passed: body.passed,
    failureReason: body.failureReason,
    idempotencyKey: body.idempotencyKey,
  });

  res.json(result);
});

export default router;
