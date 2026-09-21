import { capabilityDimensionKey, getTarget } from '@/lib/content/targets';
import type { DimensionScores, EvidenceConfidence, ReadinessState, Target } from '@/lib/db/schema';

export interface ReadinessComputation {
  simulatedReadiness: number;
  targetReadinessThreshold: number;
  gap: number;
  evidenceConfidence: EvidenceConfidence;
  readinessState: ReadinessState;
  proofRecommended: boolean;
  reliableAttemptsCounted: number;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, n));
}

/** Weighted average of this attempt's dimensions against the target's
 * declared capability requirements (spec §19). */
export function computeSimulatedReadiness(dimensions: DimensionScores, target: Target): number {
  let weightedSum = 0;
  let weightTotal = 0;
  for (const req of target.requiredCapabilities) {
    const key = capabilityDimensionKey(req.capabilityId);
    const raw = key === 'decisionQuality' ? dimensions.decisionQuality : dimensions[key];
    if (raw === null || raw === undefined) continue;
    weightedSum += req.weight * clamp(raw);
    weightTotal += req.weight;
  }
  if (weightTotal === 0) return 0;
  return Math.round(weightedSum / weightTotal);
}

/** Confidence scales with how many *reliable* simulations back the number —
 * spec §20: "one simulation should not automatically create high-confidence
 * conclusions." Consistency acts as a cap: erratic performance across
 * stages/attempts can't be laundered into high confidence just by volume. */
export function computeEvidenceConfidence(reliableAttemptsCounted: number, consistency: number): EvidenceConfidence {
  if (reliableAttemptsCounted === 0) return 'insufficient';
  if (reliableAttemptsCounted === 1) return 'low';
  if (reliableAttemptsCounted === 2) return consistency >= 50 ? 'medium' : 'low';
  return consistency >= 60 ? 'high' : 'medium';
}

export function computeReadinessState(simulatedReadiness: number, confidence: EvidenceConfidence, threshold: number): ReadinessState {
  if (confidence === 'insufficient') return 'early';
  if (simulatedReadiness < 40) return 'early';
  if (simulatedReadiness < 65) return 'developing';
  if (simulatedReadiness < threshold) return 'near_ready';
  // Numerically above threshold, but a single attempt can't yet earn the
  // "Simulation Ready" label — spec §20/§78.
  if (confidence === 'low') return 'near_ready';
  return 'simulation_ready';
}

export function computeReadiness(dimensions: DimensionScores, target: Target, reliableAttemptsCounted: number): ReadinessComputation {
  const simulatedReadiness = computeSimulatedReadiness(dimensions, target);
  const evidenceConfidence = computeEvidenceConfidence(reliableAttemptsCounted, dimensions.consistency);
  const readinessState = computeReadinessState(simulatedReadiness, evidenceConfidence, target.readinessThreshold);
  const proofRecommended = readinessState === 'simulation_ready' && evidenceConfidence === 'high';
  const gap = Math.max(0, target.readinessThreshold - simulatedReadiness);
  return { simulatedReadiness, targetReadinessThreshold: target.readinessThreshold, gap, evidenceConfidence, readinessState, proofRecommended, reliableAttemptsCounted };
}

export { getTarget };
