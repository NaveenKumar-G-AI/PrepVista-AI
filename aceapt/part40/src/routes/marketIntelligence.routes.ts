import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withMarketContext } from '../db/pool';
import * as marketIntel from '../services/marketIntelligence.service';
import { getRoleEvolution, computeAndStoreRoleEvolution } from '../services/roleEvolution.service';
import { getSkillTrendsForRole } from '../services/skillTrend.service';
import { currentPeriod } from '../lib/period';

const router = Router();

// GET /api/market-signals?roleId=...&period=YYYY-Qn (defaults to current)
router.get('/market-signals', requireStudent, async (req, res, next) => {
  try {
    const roleId = req.query.roleId as string;
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });
    const period = (req.query.period as string) || currentPeriod();
    const [signals, mixed, changed] = await withMarketContext(async (client) => {
      const s = await marketIntel.getMarketSignalsForRole(client, roleId, period);
      const m = marketIntel.detectMixedSignal(s);
      const c = await marketIntel.whatChanged(client, roleId);
      return [s, m, c] as const;
    });
    res.json({ signals, mixedSignal: mixed, whatChanged: changed });
  } catch (err) {
    next(err);
  }
});

// GET /api/role-evolution/:roleId
router.get('/role-evolution/:roleId', requireStudent, async (req, res, next) => {
  try {
    const period = (req.query.period as string) || currentPeriod();
    const evolution = await withMarketContext((client) => getRoleEvolution(client, req.params.roleId, period));
    if (!evolution) return res.status(404).json({ error: 'No role evolution data yet for this role/period.' });
    res.json(evolution);
  } catch (err) {
    next(err);
  }
});

// POST /api/role-evolution/:roleId/recompute -- (re)runs the deterministic
// classifier against the latest snapshots; would normally run from the
// worker on a schedule, exposed here too so it's testable/demoable on demand.
router.post('/role-evolution/:roleId/recompute', requireStudent, async (req, res, next) => {
  try {
    const period = (req.query.period as string) || currentPeriod();
    const { rows } = await withMarketContext((client) => client.query('SELECT title FROM roles WHERE id = $1', [req.params.roleId]));
    if (rows.length === 0) return res.status(404).json({ error: 'Unknown role' });
    const evolution = await withMarketContext((client) => computeAndStoreRoleEvolution(client, req.params.roleId, rows[0].title, period));
    res.json(evolution);
  } catch (err) {
    next(err);
  }
});

// GET /api/skill-trends?roleId=...
router.get('/skill-trends', requireStudent, async (req, res, next) => {
  try {
    const roleId = req.query.roleId as string;
    const period = (req.query.period as string) || currentPeriod();
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });
    const trends = await withMarketContext((client) => getSkillTrendsForRole(client, roleId, period));
    res.json({ trends });
  } catch (err) {
    next(err);
  }
});

export default router;
