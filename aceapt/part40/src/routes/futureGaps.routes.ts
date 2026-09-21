import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withStudentContext } from '../db/pool';
import { getOpenFutureGaps, computeAndStoreFutureGaps } from '../services/futureGap.service';
import { dispatchStrategicActions } from '../services/actionEngine.service';
import { currentPeriod } from '../lib/period';

const router = Router();

// GET /api/future-gaps?roleId=...
router.get('/', requireStudent, async (req, res, next) => {
  try {
    const roleId = req.query.roleId as string;
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });
    const gaps = await withStudentContext(req.studentId!, (client) => getOpenFutureGaps(client, req.studentId!, roleId));
    res.json({ gaps });
  } catch (err) {
    next(err);
  }
});

// POST /api/future-gaps/recompute?roleId=...  (normally worker-triggered on
// new snapshot ingestion; exposed here so it's directly testable/demoable)
router.post('/recompute', requireStudent, async (req, res, next) => {
  try {
    const roleId = req.query.roleId as string;
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });
    const period = (req.query.period as string) || currentPeriod();

    const gaps = await withStudentContext(req.studentId!, async (client) => {
      const { rows } = await client.query('SELECT title FROM roles WHERE id = $1', [roleId]);
      if (rows.length === 0) throw Object.assign(new Error('Unknown role'), { status: 404 });
      const computed = await computeAndStoreFutureGaps(client, req.studentId!, roleId, rows[0].title, period);
      const dispatched = await dispatchStrategicActions(client, req.studentId!, computed);
      return { computed, dispatched };
    });
    res.json({ gaps: gaps.computed, strategicActionsDispatched: gaps.dispatched });
  } catch (err) {
    next(err);
  }
});

export default router;
