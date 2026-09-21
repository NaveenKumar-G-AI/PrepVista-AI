import type { ReadinessSnapshot } from "../domain/types.js";
import * as repo from "../db/repository.js";
import { MockFeature8Client } from "../integration/featureClients.js";
import { computeReadinessSnapshot } from "./readinessEngine.js";

const feature8 = new MockFeature8Client();

export async function recomputeReadiness(
  studentId: string,
  profileId: string | null = null,
  asOf?: Date
): Promise<ReadinessSnapshot> {
  const simulations = await repo.listSimulationsForStudent(studentId);
  const conceptMasteryHint = await feature8.getConceptMastery(studentId);
  const previous = await repo.getLatestReadinessSnapshot(studentId);

  const snapshot = computeReadinessSnapshot({
    studentId,
    profileId,
    simulations,
    conceptMasteryHint,
    previousSnapshot: previous ? { snapshotId: previous.id, dimensions: previous.dimensions } : null,
    asOf,
  });

  await repo.saveReadinessSnapshot(snapshot);
  return snapshot;
}

export async function getCurrentReadiness(studentId: string): Promise<ReadinessSnapshot | null> {
  return repo.getLatestReadinessSnapshot(studentId);
}

export interface TrendPoint {
  createdAt: string;
  overallScore: number;
  overallState: ReadinessSnapshot["overallState"];
}

export async function getReadinessTrend(studentId: string): Promise<TrendPoint[]> {
  const snapshots = await repo.listReadinessSnapshots(studentId);
  return snapshots.map((s) => ({ createdAt: s.createdAt, overallScore: s.overallScore, overallState: s.overallState }));
}
