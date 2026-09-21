import { newId } from '@/lib/ids';
import { capabilityDimensionKey } from '@/lib/content/targets';
import { getCapabilityState, upsertCapabilityState } from '@/lib/db/repository';
import type { EvaluationOutput } from './evaluation-engine';
import type { SimulationAttempt, SimulationEvidence } from '@/lib/db/schema';

// Higher-level simulations count for more — a Level 1 practice run
// shouldn't move a capability estimate as much as a Level 3 realistic run
// (spec §8 levels, §20 evidence confidence).
const LEVEL_WEIGHT: Record<number, number> = { 1: 0.5, 2: 0.75, 3: 1, 4: 1.25 };

export function buildEvidence(attempt: SimulationAttempt, evaluation: EvaluationOutput, usedAsEvidence: boolean): SimulationEvidence[] {
  const capabilityIds = Array.from(new Set(attempt.blueprint.stages.flatMap((s) => s.capabilityIds)));
  const weight = usedAsEvidence ? LEVEL_WEIGHT[attempt.blueprint.level] ?? 1 : 0;
  const now = new Date().toISOString();

  return capabilityIds.map((capabilityId) => {
    const key = capabilityDimensionKey(capabilityId);
    const accuracy = (key === 'decisionQuality' ? evaluation.dimensions.decisionQuality : evaluation.dimensions[key]) ?? 0;
    return {
      id: newId('ev'),
      attemptId: attempt.id,
      studentId: attempt.studentId,
      targetId: attempt.targetId,
      capabilityId,
      accuracy,
      speed: evaluation.dimensions.speed,
      transfer: evaluation.dimensions.transfer,
      consistency: evaluation.dimensions.consistency,
      completion: evaluation.dimensions.completion,
      decisionQuality: evaluation.dimensions.decisionQuality,
      weight,
      createdAt: now,
    };
  });
}

/** Blends new evidence into each capability's running proficiency estimate.
 * A simple recency-weighted blend — real ACEAPT capability infrastructure
 * would replace this function's body without touching its call sites. */
export function applyEvidenceToCapabilityState(evidence: SimulationEvidence[]): void {
  for (const e of evidence) {
    if (e.weight <= 0) continue;
    const existing = getCapabilityState(e.studentId, e.capabilityId);
    const blendFactor = clamp01(0.5 * e.weight);
    const nextProficiency = existing ? Math.round(existing.proficiency * (1 - blendFactor) + e.accuracy * blendFactor) : Math.round(e.accuracy);
    upsertCapabilityState({
      studentId: e.studentId,
      capabilityId: e.capabilityId,
      proficiency: nextProficiency,
      lastUpdatedAt: e.createdAt,
      sourceAttemptIds: [...(existing?.sourceAttemptIds ?? []), e.attemptId],
    });
  }
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}
