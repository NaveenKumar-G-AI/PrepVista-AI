// ============================================================================
// Retention strength.
//
// "Represent uncertainty. Do not create fake precision. Prefer Strong /
// Moderate / Weak instead of 87.43% if evidence is insufficient." This
// module is where that rule is enforced: a numeric score is only ever
// attached once evidence sufficiency clears a threshold, and even then it's
// meant as an internal ranking aid, not the primary way to show retention
// to a student.
// ============================================================================

import { RetentionEvidence, RetentionStrengthBand, RetrievalAttempt } from '../domain/types';
import { computeEvidenceSufficiency } from './evidence';

export interface RetentionStrengthResult {
  band: RetentionStrengthBand;
  /** Only present when sufficiency >= SUFFICIENCY_THRESHOLD. */
  score?: number;
  sufficiency: number;
}

const SUFFICIENCY_THRESHOLD = 0.35;

export function calculateRetentionStrength(
  evidence: RetentionEvidence,
  attempts: RetrievalAttempt[]
): RetentionStrengthResult {
  const sufficiency = computeEvidenceSufficiency(attempts);

  if (sufficiency < SUFFICIENCY_THRESHOLD) {
    return { band: 'INSUFFICIENT_EVIDENCE', sufficiency };
  }

  const weighted: Array<[number | null, number]> = [
    [evidence.recentSuccessRate, 0.3],
    [evidence.transferSuccessRate, 0.25],
    [evidence.contextDiversityScore, 0.15],
    [1 - evidence.hintDependencyRate, 0.1],
    [1 - evidence.explanationDependencyRate, 0.1],
    [evidence.reactivationSuccessRate, 0.1],
  ];

  const usable = weighted.filter((pair): pair is [number, number] => pair[0] !== null);
  const weightTotal = usable.reduce((sum, [, w]) => sum + w, 0) || 1;
  const score = usable.reduce((sum, [v, w]) => sum + v * w, 0) / weightTotal;

  const band: RetentionStrengthBand = score >= 0.8 ? 'STRONG' : score >= 0.55 ? 'MODERATE' : 'WEAK';

  return { band, score: Number(score.toFixed(3)), sufficiency };
}
