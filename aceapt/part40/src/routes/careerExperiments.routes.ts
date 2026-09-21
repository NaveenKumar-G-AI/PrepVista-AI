import { Router } from 'express';
import { requireStudent } from '../middleware/auth';
import { withStudentContext } from '../db/pool';
import { startCareerExperiment, completeCareerExperiment, listExperiments } from '../services/careerExperiment.service';

const router = Router();

// GET /api/career-experiments
router.get('/', requireStudent, async (req, res, next) => {
  try {
    const experiments = await withStudentContext(req.studentId!, (client) => listExperiments(client, req.studentId!));
    res.json({ experiments });
  } catch (err) {
    next(err);
  }
});

// POST /api/career-experiments  { roleId, durationDays? }
router.post('/', requireStudent, async (req, res, next) => {
  try {
    const { roleId, durationDays } = req.body ?? {};
    if (!roleId) return res.status(400).json({ error: 'roleId is required' });

    const result = await withStudentContext(req.studentId!, async (client) => {
      const { rows } = await client.query('SELECT title FROM roles WHERE id = $1', [roleId]);
      if (rows.length === 0) throw Object.assign(new Error('Unknown role'), { status: 404 });
      return startCareerExperiment(client, req.studentId!, roleId, rows[0].title, durationDays ?? 14);
    });
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/career-experiments/:id/complete  { reflection, interestRating, difficultyRating }
router.post('/:id/complete', requireStudent, async (req, res, next) => {
  try {
    const { reflection, interestRating, difficultyRating } = req.body ?? {};
    if (!reflection || !interestRating || !difficultyRating) {
      return res.status(400).json({ error: 'reflection, interestRating (1-5), and difficultyRating (1-5) are required' });
    }
    const result = await withStudentContext(req.studentId!, (client) =>
      completeCareerExperiment(client, req.studentId!, req.params.id, reflection, Number(interestRating), Number(difficultyRating))
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
