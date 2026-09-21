import { Request, Response } from 'express';
import { eventStore, snapshotStore } from '../../infrastructure/store';
import { runAllSignalDetectors } from '../../domain/signals';
import { buildBehaviorProfile } from '../../domain/profileBuilder';
import { buildProfileSummary } from '../../domain/explain/explanationEngine';

export async function getBehaviorProfile(req: Request, res: Response): Promise<void> {
  const studentId = req.params.id as string;
  const events = await eventStore.query({ studentId });
  const now = new Date();
  const signals = runAllSignalDetectors(events, studentId, now);
  const profile = buildBehaviorProfile(studentId, signals, events, now);
  await snapshotStore.save(profile);
  res.json(profile);
}

export async function getBehaviorSignals(req: Request, res: Response): Promise<void> {
  const studentId = req.params.id as string;
  const events = await eventStore.query({ studentId });
  const signals = runAllSignalDetectors(events, studentId, new Date());
  res.json({ studentId, signals });
}

export async function getBehaviorSummary(req: Request, res: Response): Promise<void> {
  const studentId = req.params.id as string;
  const events = await eventStore.query({ studentId });
  const now = new Date();
  const signals = runAllSignalDetectors(events, studentId, now);
  const profile = buildBehaviorProfile(studentId, signals, events, now);
  res.json({
    studentId,
    isColdStart: profile.isColdStart,
    summary: buildProfileSummary(profile),
    headline: Object.entries(profile.dimensions).map(([dimension, d]) => ({ dimension, level: d.level })),
  });
}

export async function getBehaviorHistory(req: Request, res: Response): Promise<void> {
  const studentId = req.params.id as string;
  const snapshots = await snapshotStore.history(studentId);
  res.json({ studentId, snapshots });
}

export async function getAdaptiveSignals(req: Request, res: Response): Promise<void> {
  const studentId = req.params.id as string;
  const events = await eventStore.query({ studentId });
  const signals = runAllSignalDetectors(events, studentId, new Date());
  // Feature 7 consumes ACTIVE signals above a reasonable confidence floor -
  // filtering low-confidence noise here means every downstream consumer
  // doesn't have to re-implement that judgment call.
  const actionable = signals.filter((s) => s.status === 'ACTIVE' && s.confidence >= 0.4);
  res.json({ studentId, signals: actionable });
}
