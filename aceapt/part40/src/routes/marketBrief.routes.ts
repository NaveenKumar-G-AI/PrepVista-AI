import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withStudentContext, withMarketContext } from '../db/pool';
import { generateDailySignal, generateWeeklyBrief, evaluateTechnologyDecision } from '../services/marketBrief.service';
import { getAllTargetRoles } from '../integrations/feature34.adapter';

const router = Router();

async function primaryRole(client: any, studentId: string) {
  const targets = await getAllTargetRoles(client, studentId);
  if (targets.length === 0) return null;
  return targets.reduce((best: any, r: any) => (r.priority < best.priority ? r : best), targets[0]);
}

// GET /api/market-brief/daily
router.get('/daily', requireStudent, async (req, res, next) => {
  try {
    const result = await withStudentContext(req.studentId!, async (client) => {
      const role = await primaryRole(client, req.studentId!);
      if (!role) return null;
      return generateDailySignal(client, req.studentId!, role.roleId, role.roleTitle);
    });
    if (!result) return res.json({ signal: null, message: 'No target role set, or no new signal to surface today.' });
    res.json({ signal: result });
  } catch (err) {
    next(err);
  }
});

// GET /api/market-brief/weekly
router.get('/weekly', requireStudent, async (req, res, next) => {
  try {
    const result = await withStudentContext(req.studentId!, async (client) => {
      const role = await primaryRole(client, req.studentId!);
      if (!role) return null;
      return generateWeeklyBrief(client, req.studentId!, role.roleId, role.roleTitle);
    });
    if (!result) return res.json({ brief: null, message: 'No target role set yet.' });
    res.json({ brief: result });
  } catch (err) {
    next(err);
  }
});

export default router;

// POST /api/technology-analysis  { technologyName, roleId? }
// Mounted directly on its own path in server.ts (sibling to /api/market-brief,
// not nested under it) -- kept in this file since it shares
// marketBrief.service.ts, not because it's a sub-route of /market-brief.
export async function technologyAnalysisHandler(req: any, res: any, next: any) {
  try {
    const { technologyName, roleId } = req.body ?? {};
    if (!technologyName) return res.status(400).json({ error: 'technologyName is required' });
    const result = await withMarketContext((client) => evaluateTechnologyDecision(client, technologyName, roleId ?? null));
    res.json(result);
  } catch (err) {
    next(err);
  }
}
