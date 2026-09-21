import type { EvidenceConfidence } from '../domain/enums';
import type { PrioritySignal } from '../domain/types';

const EVIDENCE_FACTOR: Record<EvidenceConfidence, number> = {
  NONE: 0,
  LOW: 0.4,
  MODERATE: 0.75,
  HIGH: 1,
};

const WEIGHTS = {
  weakness: 0.4,
  structural: 0.35,
  goal: 0.25,
};

const HIGHEST_LEVERAGE_WEAKNESS_FLOOR = 30; // percentage points below full capability

export interface PriorityInput {
  skillCode: string;
  displayName: string;
  capability: number | null;
  confidence: EvidenceConfidence;
  isGoalRelevant: boolean;
  downstreamCount: number;
  maxDownstreamInSet: number; // for normalizing structural importance across the candidate set
}

/**
 * Section 34: structural importance alone must NOT determine priority.
 * Combines goal relevance + weakness + evidence sufficiency + dependency
 * importance into one explainable score. Never claims guaranteed downstream
 * improvement (section 35) — the explanation stays descriptive, not causal.
 */
export function computePrioritySignal(input: PriorityInput): PrioritySignal {
  const weaknessScore = input.capability === null ? null : Math.max(0, 100 - input.capability);
  const structuralImportance = input.maxDownstreamInSet > 0 ? input.downstreamCount / input.maxDownstreamInSet : 0;

  const evidenceFactor = EVIDENCE_FACTOR[input.confidence];
  const goalFactor = input.isGoalRelevant ? 1 : 0.3; // non-goal skills can still matter structurally, just dampened
  const weaknessFactor = weaknessScore === null ? 0 : weaknessScore / 100; // UNKNOWN contributes 0, never treated as "weak"

  const rawScore = (WEIGHTS.weakness * weaknessFactor + WEIGHTS.structural * structuralImportance + WEIGHTS.goal * goalFactor) * evidenceFactor * 100;

  const isHighestLeverageCandidate =
    input.isGoalRelevant && weaknessScore !== null && weaknessScore >= HIGHEST_LEVERAGE_WEAKNESS_FLOOR && input.confidence !== 'NONE' && structuralImportance > 0;

  const parts: string[] = [];
  if (input.isGoalRelevant) parts.push('relevant to your current goal');
  if (weaknessScore !== null && weaknessScore >= HIGHEST_LEVERAGE_WEAKNESS_FLOOR) parts.push('a measured gap in your recent evidence');
  else if (weaknessScore === null) parts.push('not yet evaluated — evidence is needed before this can be a confident priority');
  if (input.downstreamCount > 0) {
    parts.push(`a supporting skill for ${input.downstreamCount} other skill${input.downstreamCount === 1 ? '' : 's'} ACEAPT will keep monitoring`);
  }

  return {
    skillCode: input.skillCode,
    displayName: input.displayName,
    leverageScore: Math.round(rawScore),
    signals: {
      isGoalRelevant: input.isGoalRelevant,
      weaknessScore,
      evidenceConfidence: input.confidence,
      downstreamCount: input.downstreamCount,
      structuralImportance: Math.round(structuralImportance * 100) / 100,
    },
    isHighestLeverageCandidate,
    explanation: parts.length ? parts.join('; ') : 'Insufficient signal yet to explain a priority ranking.',
  };
}
