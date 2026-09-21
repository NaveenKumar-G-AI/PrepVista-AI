import { Router } from 'express';
import { z } from 'zod';
import { getDb } from '../../db/client';
import { AppError, httpStatusForError } from '../../domain/errors';
import { setActiveTarget, getActiveTarget } from '../../repositories/studentRepo';
import { generateOrGetRoadmap, recalculate } from '../../repositories/roadmapRepo';
import type { AuthedRequest } from '../auth';

export const targetRouter = Router();

const TargetSchema = z.object({
  targetRoleId: z.string().min(1),
  goal: z.enum(['GENERAL_CODING', 'PLACEMENT_PREPARATION', 'INTERVIEW_PREPARATION', 'ROLE_PREPARATION']),
  targetState: z.string().default('INTERVIEW_READY'),
  targetDate: z.string().nullable().optional(),
  dailyMinutes: z.number().int().min(5).max(480).default(60),
  preferredLanguage: z.string().default('Python'),
  focusAreas: z.array(z.string()).default([]),
});

targetRouter.get('/', (req: AuthedRequest, res) => {
  const db = getDb();
  const studentId = req.auth!.studentId; // NEVER taken from req.params/query — Phase 50
  const target = getActiveTarget(db, studentId);
  if (!target) return res.status(404).json({ error: 'no active target set' });
  res.json(target);
});

targetRouter.post('/', (req: AuthedRequest, res) => {
  const db = getDb();
  const studentId = req.auth!.studentId;
  const parsed = TargetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(422).json({ error: 'validation_error', details: parsed.error.flatten() });

  const prevTarget = getActiveTarget(db, studentId);
  const roleChanged = prevTarget && prevTarget.targetRoleId !== parsed.data.targetRoleId;
  const goalChanged = prevTarget && prevTarget.goal !== parsed.data.goal;
  const dateChanged = prevTarget && prevTarget.targetDate !== (parsed.data.targetDate ?? null);
  const timeChanged = prevTarget && prevTarget.dailyMinutes !== parsed.data.dailyMinutes;

  const target = setActiveTarget(db, {
    studentId,
    targetRoleId: parsed.data.targetRoleId,
    goal: parsed.data.goal,
    targetState: parsed.data.targetState,
    targetDate: parsed.data.targetDate ?? null,
    dailyMinutes: parsed.data.dailyMinutes,
    preferredLanguage: parsed.data.preferredLanguage,
    focusAreas: parsed.data.focusAreas,
  });

  try {
    if (!prevTarget) {
      const version = generateOrGetRoadmap(db, studentId);
      return res.status(201).json({ target, roadmapVersion: version });
    }
    const trigger = roleChanged ? 'ROLE_CHANGED' : goalChanged ? 'GOAL_CHANGED' : dateChanged ? 'DEADLINE_CHANGED' : timeChanged ? 'TIME_CHANGED' : 'MANUAL';
    const result = recalculate(db, studentId, trigger);
    res.json({ target, roadmapVersion: result.version, recalculated: result.changed });
  } catch (err) {
    if (err instanceof AppError) return res.status(httpStatusForError(err.code)).json({ error: err.code, message: err.message });
    throw err;
  }
});
