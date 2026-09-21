import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withStudentContext } from '../db/pool';
import { getCareerHorizon } from '../services/careerHorizon.service';
import { currentPeriod } from '../lib/period';

const router = Router();

// GET /api/career-horizon
router.get('/', requireStudent, async (req, res, next) => {
  try {
    const period = (req.query.period as string) || currentPeriod();
    const result = await withStudentContext(req.studentId!, (client) => getCareerHorizon(client, req.studentId!, period));
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
