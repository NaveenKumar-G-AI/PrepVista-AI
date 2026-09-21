import { AlignmentState, ImportanceTier } from '../domain/types';
import { RequirementEvaluation } from './requirementEvaluator';

/**
 * Decides the alignment state (spec §21). This runs BEFORE the caller is
 * allowed to trust fitScore/readinessScore for display — see
 * alignmentEngine.ts, which nulls out both scores whenever this returns
 * INSUFFICIENT_EVIDENCE (spec §20: never fabricate a score).
 */

const IMPORTANCE_WEIGHT: Record<ImportanceTier, number> = {
  CORE: 1.0,
  IMPORTANT: 0.6,
  SUPPORTING: 0.3,
};

/** Below this importance-weighted evidence coverage, we don't have enough to speak reliably. */
const MIN_EVIDENCE_COVERAGE_RATIO = 0.5;

const STRONG_FIT_MIN = 80;
const STRONG_READINESS_MIN = 60;
const DEVELOPING_FIT_MIN = 55;

export interface StateClassification {
  state: AlignmentState;
  /** Why INSUFFICIENT_EVIDENCE was chosen, if it was — for the explanation layer and UI copy. */
  insufficientEvidenceReason: string | null;
}

export function classifyAlignmentState(
  evaluations: RequirementEvaluation[],
  fitScore: number,
  readinessScore: number,
  criticalGapCount: number,
): StateClassification {
  if (evaluations.length === 0) {
    return {
      state: 'INSUFFICIENT_EVIDENCE',
      insufficientEvidenceReason: 'This target has no configured requirements yet.',
    };
  }

  const missingCoreCapabilities = evaluations.filter(
    (r) => r.importance === 'CORE' && !r.hasEvidence,
  );
  if (missingCoreCapabilities.length > 0) {
    return {
      state: 'INSUFFICIENT_EVIDENCE',
      insufficientEvidenceReason: `No evidence yet for ${missingCoreCapabilities
        .map((r) => r.capabilityName)
        .join(', ')} — a core requirement for this target.`,
    };
  }

  let coveredWeight = 0;
  let totalWeight = 0;
  for (const r of evaluations) {
    const w = IMPORTANCE_WEIGHT[r.importance];
    totalWeight += w;
    if (r.hasEvidence) coveredWeight += w;
  }
  const coverageRatio = totalWeight > 0 ? coveredWeight / totalWeight : 0;

  if (coverageRatio < MIN_EVIDENCE_COVERAGE_RATIO) {
    return {
      state: 'INSUFFICIENT_EVIDENCE',
      insufficientEvidenceReason:
        'Too many of this target\u2019s requirements are still unassessed for a reliable result.',
    };
  }

  if (fitScore >= STRONG_FIT_MIN && readinessScore >= STRONG_READINESS_MIN && criticalGapCount === 0) {
    return { state: 'STRONGLY_ALIGNED', insufficientEvidenceReason: null };
  }

  if (fitScore >= DEVELOPING_FIT_MIN && criticalGapCount <= 1) {
    return { state: 'DEVELOPING_ALIGNMENT', insufficientEvidenceReason: null };
  }

  return { state: 'LOW_ALIGNMENT', insufficientEvidenceReason: null };
}
