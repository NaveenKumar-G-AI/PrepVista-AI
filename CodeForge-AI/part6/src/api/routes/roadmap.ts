import { Router } from 'express';
import { getDb } from '../../db/client';
import { AppError, httpStatusForError } from '../../domain/errors';
import {
  explainRoadmapSkillById,
  generateOrGetRoadmap,
  getActiveRoadmapVersion,
  getDailyPlan,
  getEvents,
  getRoadmapVersionsSummary,
  getSkillDetail,
  getWeeklyPlan,
} from '../../repositories/roadmapRepo';
import type { AuthedRequest } from '../auth';

export const roadmapRouter = Router();

roadmapRouter.get('/', (req: AuthedRequest, res) => {
  const version = getActiveRoadmapVersion(getDb(), req.auth!.studentId);
  if (!version) return res.status(404).json({ error: 'no active roadmap — POST /roadmap/generate first' });
  res.json(version);
});

roadmapRouter.post('/generate', (req: AuthedRequest, res) => {
  try {
    const version = generateOrGetRoadmap(getDb(), req.auth!.studentId);
    res.json(version);
  } catch (err) {
    if (err instanceof AppError) return res.status(httpStatusForError(err.code)).json({ error: err.code, message: err.message });
    throw err;
  }
});

roadmapRouter.get('/versions', (req: AuthedRequest, res) => {
  res.json(getRoadmapVersionsSummary(getDb(), req.auth!.studentId));
});

roadmapRouter.get('/skills/:skillId', (req: AuthedRequest, res) => {
  const detail = getSkillDetail(getDb(), req.auth!.studentId, req.params.skillId);
  if (!detail) return res.status(404).json({ error: 'skill not found' });
  res.json(detail);
});

roadmapRouter.get('/explain/:roadmapSkillId', (req: AuthedRequest, res) => {
  const db = getDb();
  // Ownership check: the roadmap_skill must belong to a milestone belonging
  // to a version belonging to a roadmap owned by the authenticated student.
  const owns = db
    .prepare(
      `SELECT 1 FROM roadmap_skills rs
       JOIN roadmap_milestones rm ON rm.id = rs.roadmap_milestone_id
       JOIN roadmap_versions rv ON rv.id = rm.roadmap_version_id
       JOIN roadmaps r ON r.id = rv.roadmap_id
       WHERE rs.id = ? AND r.student_id = ?`
    )
    .get(req.params.roadmapSkillId, req.auth!.studentId);
  if (!owns) return res.status(404).json({ error: 'not found' });

  const explanation = explainRoadmapSkillById(db, req.params.roadmapSkillId);
  res.json({ explanation });
});

roadmapRouter.get('/daily-plan', (req: AuthedRequest, res) => {
  const plan = getDailyPlan(getDb(), req.auth!.studentId, req.query.date as string | undefined);
  if (!plan) return res.status(404).json({ error: 'no plan generated for that date yet' });
  res.json(plan);
});

roadmapRouter.get('/weekly-plan', (req: AuthedRequest, res) => {
  const plan = getWeeklyPlan(getDb(), req.auth!.studentId, req.query.weekStart as string | undefined);
  if (!plan) return res.status(404).json({ error: 'no plan generated for that week yet' });
  res.json(plan);
});

roadmapRouter.get('/events', (req: AuthedRequest, res) => {
  res.json(getEvents(getDb(), req.auth!.studentId));
});
