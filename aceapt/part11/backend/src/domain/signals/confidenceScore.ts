import { THRESHOLDS } from '../../config/thresholds';

/**
 * Shared evidence -> confidence curve (section 24: Signal Confidence).
 *
 * Every detector calls this instead of inventing its own confidence math,
 * so "how much evidence backs this claim" means the same thing everywhere
 * in the product. Inputs:
 *  - evidenceCount: independent observations behind the signal
 *  - recencyDays: age of the most recent supporting observation
 *  - patternConsistency: 0-1, how uniform the pattern was (low variance
 *    across observations). Detectors that cannot measure this pass 1
 *    (neutral) rather than fabricating a number.
 *
 * This is a simple, auditable heuristic on purpose (see README "Future ML
 * readiness") - swapping its internals for a calibrated/learned model later
 * requires touching this one function, not any individual detector.
 */
export interface ConfidenceInputs {
  evidenceCount: number;
  recencyDays: number;
  patternConsistency?: number;
}

export function computeSignalConfidence({ evidenceCount, recencyDays, patternConsistency = 1 }: ConfidenceInputs): number {
  if (evidenceCount <= 0) return 0;

  const { LOW_EVIDENCE_MAX, MEDIUM_EVIDENCE_MAX } = THRESHOLDS.confidenceScoring;

  let evidenceScore: number;
  if (evidenceCount <= LOW_EVIDENCE_MAX) {
    evidenceScore = 0.3 * (evidenceCount / LOW_EVIDENCE_MAX);
  } else if (evidenceCount <= MEDIUM_EVIDENCE_MAX) {
    evidenceScore = 0.3 + 0.4 * ((evidenceCount - LOW_EVIDENCE_MAX) / (MEDIUM_EVIDENCE_MAX - LOW_EVIDENCE_MAX));
  } else {
    evidenceScore = Math.min(1, 0.7 + 0.3 * Math.min(1, (evidenceCount - MEDIUM_EVIDENCE_MAX) / MEDIUM_EVIDENCE_MAX));
  }

  const recencyScore =
    recencyDays <= 3 ? 1 : recencyDays <= 7 ? 0.85 : recencyDays <= 14 ? 0.65 : recencyDays <= 30 ? 0.4 : 0.2;

  const raw = evidenceScore * 0.55 + recencyScore * 0.25 + clampedConsistency(patternConsistency) * 0.2;
  return Math.round(Math.max(0, Math.min(1, raw)) * 100) / 100;
}

function clampedConsistency(v: number): number {
  return Math.max(0, Math.min(1, v));
}
