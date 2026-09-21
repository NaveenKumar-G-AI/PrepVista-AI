import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withStudentContext } from '../db/pool';
import { computeCareerBranching, compareCareerPaths, hasSkillConcentrationRisk } from '../services/careerPaths.service';
import { hasCareerConcentrationRisk, getAllTargetRoles } from '../integrations/feature34.adapter';
import { currentPeriod } from '../lib/period';

const router = Router();

// GET /api/career-paths?roleId=...&roleTitle=...  -> branching for the primary role
router.get('/', requireStudent, async (req, res, next) => {
  try {
    const roleId = req.query.roleId as string;
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });
    const period = (req.query.period as string) || currentPeriod();

    const result = await withStudentContext(req.studentId!, async (client) => {
      const { rows } = await client.query('SELECT title FROM roles WHERE id = $1', [roleId]);
      if (rows.length === 0) throw Object.assign(new Error('Unknown role'), { status: 404 });
      const branches = await computeCareerBranching(client, req.studentId!, roleId, rows[0].title, period);
      const allTargets = await getAllTargetRoles(client, req.studentId!);
      const careerConcentration = hasCareerConcentrationRisk(allTargets);
      const skillConcentration = await hasSkillConcentrationRisk(client, req.studentId!);
      return { branches, careerConcentrationRisk: careerConcentration, skillConcentrationRisk: skillConcentration };
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// GET /api/career-paths/compare?roleIds=a,b,c
router.get('/compare', requireStudent, async (req, res, next) => {
  try {
    const roleIds = ((req.query.roleIds as string) || '').split(',').filter(Boolean);
    if (roleIds.length < 2) return res.status(400).json({ error: 'At least 2 roleIds required (comma-separated).' });
    const period = (req.query.period as string) || currentPeriod();
    const rows = await withStudentContext(req.studentId!, (client) => compareCareerPaths(client, req.studentId!, roleIds, period));
    res.json({ comparison: rows });
  } catch (err) {
    next(err);
  }
});

export default router;
