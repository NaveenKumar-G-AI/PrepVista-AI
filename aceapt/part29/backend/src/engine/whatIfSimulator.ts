import {
  CAPABILITY_LEVEL_SCORE,
  CapabilityDna,
  CapabilityLevel,
  ForecastSignal,
  TargetProfile,
  WhatIfInput,
  WhatIfResult,
} from '../domain/types';
import { findEntry } from './capabilityDna';
import { calculateAlignment } from './alignmentEngine';
import { capabilityName as lookupCapabilityName } from '../config/capabilities';

/**
 * "What if I improve?" (spec §28-30, §46).
 *
 * This never invents a projected score — it builds a hypothetical
 * CapabilityDna with exactly one entry changed and re-runs the same
 * deterministic pipeline used everywhere else. If the current baseline is
 * too thin to trust a delta, it returns null scores rather than a
 * confident-looking number (spec §46: "no fake precision").
 *
 * Deliberately does NOT flip hasVerifiedEvidence to true for the projected
 * entry — improving a capability level is not the same as Feature 28
 * (PROOF) verifying it, and readiness must not silently inherit a
 * verification the student hasn't actually earned yet.
 */

const MIN_EVENTS_FOR_RELIABLE_PROJECTION = 2;

export function runWhatIf(
  dna: CapabilityDna,
  target: TargetProfile,
  input: Omit<WhatIfInput, 'studentId' | 'targetId'>,
  forecastSignals: ForecastSignal[] = [],
  now: Date = new Date(),
): WhatIfResult {
  const currentEntry = findEntry(dna, input.capabilityId);
  const current = calculateAlignment(dna, target, forecastSignals, now);

  const projectedLevelScore = CAPABILITY_LEVEL_SCORE[input.projectedLevel];
  const projectedEntry = {
    capabilityId: input.capabilityId,
    capabilityName: currentEntry?.capabilityName ?? lookupCapabilityName(input.capabilityId),
    level: input.projectedLevel,
    levelScore: projectedLevelScore,
    confidence: currentEntry?.confidence ?? {
      band: 'MEDIUM' as const,
      score: 0.5,
      attemptCount: 0,
      proofVerifiedCount: 0,
      mostRecentAt: null,
      reasons: ['Hypothetical projection — no evidence backs this yet'],
    },
    hasVerifiedEvidence: currentEntry?.hasVerifiedEvidence ?? false,
    evidenceEventCount: currentEntry?.evidenceEventCount ?? 0,
  };

  const projectedDna: CapabilityDna = {
    studentId: dna.studentId,
    generatedAt: now.toISOString(),
    entries: [
      ...dna.entries.filter((e) => e.capabilityId !== input.capabilityId),
      projectedEntry,
    ],
  };

  const projected = calculateAlignment(projectedDna, target, forecastSignals, now);

  const baselineEventCount = currentEntry?.evidenceEventCount ?? 0;
  const projectionReliable = baselineEventCount >= MIN_EVENTS_FOR_RELIABLE_PROJECTION;

  return {
    studentId: dna.studentId,
    targetId: target.targetId,
    capabilityId: input.capabilityId,
    currentLevel: currentEntry?.level ?? 'VERY_WEAK',
    projectedLevel: input.projectedLevel,
    currentFitScore: current.fitScore,
    projectedFitScore: projectionReliable ? projected.fitScore : null,
    currentReadinessScore: current.readinessScore,
    projectedReadinessScore: projectionReliable ? projected.readinessScore : null,
    projectionReliable,
    label: 'PROJECTED',
  };
}

/** Compares improving each of several capabilities one at a time (spec §29). */
export function compareWhatIfScenarios(
  dna: CapabilityDna,
  targetsByCapability: { capabilityId: string; target: TargetProfile; projectedLevel: CapabilityLevel }[],
  forecastSignals: ForecastSignal[] = [],
  now: Date = new Date(),
): WhatIfResult[] {
  return targetsByCapability.map(({ capabilityId, target, projectedLevel }) =>
    runWhatIf(dna, target, { capabilityId, projectedLevel }, forecastSignals, now),
  );
}
