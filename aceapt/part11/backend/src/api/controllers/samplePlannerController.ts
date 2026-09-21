import { Request, Response } from 'express';
import { eventStore } from '../../infrastructure/store';
import { runAllSignalDetectors } from '../../domain/signals';
import { recommendPlanChange } from '../../sample-adaptive-planner/planAdapter';

/** Demo-only endpoint - see sample-adaptive-planner/planAdapter.ts for why this exists outside Feature 11 proper. */
export async function getSamplePlanChange(req: Request, res: Response): Promise<void> {
  const studentId = req.params.id as string;
  const currentPlannedSessionMinutes = Number(req.query.currentPlannedMinutes ?? 60);
  const events = await eventStore.query({ studentId });
  const signals = runAllSignalDetectors(events, studentId, new Date());
  const recommendation = recommendPlanChange(signals, currentPlannedSessionMinutes);
  res.json(recommendation);
}
