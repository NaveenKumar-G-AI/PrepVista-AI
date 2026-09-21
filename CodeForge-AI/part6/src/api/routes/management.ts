import { Router } from 'express';
import { getDb } from '../../db/client';
import { cohortSummary } from '../../repositories/roadmapRepo';
import type { AuthedRequest } from '../auth';

export const managementRouter = Router();

// Gated by requireRole('TPO_ADMIN') where mounted in server.ts. Returns
// aggregate percentages only — never a per-student breakdown. This is
// intentionally the entire scope of the "management" surface: no recruiter
// access, no hiring decisions, no placement-drive management (explicitly
// out of scope per the brief's Phase 42).
managementRouter.get('/cohort/:cohortId/summary', (req: AuthedRequest, res) => {
  const summary = cohortSummary(getDb(), req.params.cohortId);
  res.json(summary);
});
