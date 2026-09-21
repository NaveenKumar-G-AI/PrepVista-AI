import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withStudentContext } from '../db/pool';
import { generateCareerScenario, listScenarios, ScenarioType } from '../services/scenarioSimulator.service';
import { currentPeriod } from '../lib/period';

const router = Router();

const VALID_TYPES: ScenarioType[] = ['AI_AUTOMATION_INCREASE', 'TECH_DECLINE', 'CLOUD_IMPORTANCE_RISES', 'DEMAND_SHIFT', 'NEW_ROLE_EMERGES'];

// GET /api/career-scenarios -> list student's saved scenarios
router.get('/', requireStudent, async (req, res, next) => {
  try {
    const scenarios = await withStudentContext(req.studentId!, (client) => listScenarios(client, req.studentId!));
    res.json({ scenarios });
  } catch (err) {
    next(err);
  }
});

// POST /api/career-scenarios  { roleId, scenarioType }
router.post('/', requireStudent, async (req, res, next) => {
  try {
    const { roleId, scenarioType } = req.body ?? {};
    if (!roleId || !scenarioType) return res.status(400).json({ error: 'roleId and scenarioType are required' });
    if (!VALID_TYPES.includes(scenarioType)) return res.status(400).json({ error: `scenarioType must be one of: ${VALID_TYPES.join(', ')}` });
    const period = currentPeriod();

    const result = await withStudentContext(req.studentId!, async (client) => {
      const { rows } = await client.query('SELECT title FROM roles WHERE id = $1', [roleId]);
      if (rows.length === 0) throw Object.assign(new Error('Unknown role'), { status: 404 });
      return generateCareerScenario(client, req.studentId!, roleId, rows[0].title, scenarioType, period);
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
