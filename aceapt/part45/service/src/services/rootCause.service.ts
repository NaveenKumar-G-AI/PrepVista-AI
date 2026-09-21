import type { EvidenceAggregate, RootCauseSignal } from '../domain/types';

export interface PrerequisiteEvidence {
  code: string;
  state: EvidenceAggregate;
  hopDistance: number;
}

const DEFAULT_WEAKNESS_THRESHOLD = 60;

/**
 * Investigates whether a weak skill's measured prerequisites are ALSO weak
 * (spec sections 29-30). This is a correlation-level signal, not a causal
 * claim — the language and `confidence` field are deliberately hedged, and
 * the returned shape matches the spec's own JSON example field-for-field.
 */
export function analyzeRootCause(params: {
  targetSkillCode: string;
  targetState: EvidenceAggregate;
  prerequisites: PrerequisiteEvidence[];
  weaknessThreshold?: number;
}): RootCauseSignal {
  const threshold = params.weaknessThreshold ?? DEFAULT_WEAKNESS_THRESHOLD;
  const { targetState } = params;

  if (targetState.capability === null || targetState.confidence === 'NONE') {
    return {
      target_skill: params.targetSkillCode,
      possible_prerequisite_gap: null,
      evidence: { target_capability: null, prerequisite_capability: null },
      confidence: 'insufficient_evidence',
      note: 'Not enough evidence on the target skill itself to investigate a prerequisite gap.',
    };
  }

  if (targetState.capability >= threshold) {
    return {
      target_skill: params.targetSkillCode,
      possible_prerequisite_gap: null,
      evidence: { target_capability: targetState.capability, prerequisite_capability: null },
      confidence: 'insufficient_evidence',
      note: 'Target skill is not currently a measured weak area, so a prerequisite-gap investigation does not apply.',
    };
  }

  const weakPrereqs = params.prerequisites
    .filter((p) => p.state.capability !== null && p.state.capability < threshold)
    .sort((a, b) => a.hopDistance - b.hopDistance || (a.state.capability as number) - (b.state.capability as number));

  if (weakPrereqs.length === 0) {
    return {
      target_skill: params.targetSkillCode,
      possible_prerequisite_gap: null,
      evidence: { target_capability: targetState.capability, prerequisite_capability: null },
      confidence: 'insufficient_evidence',
      note: 'Target skill is weak, but its measured prerequisites are not — the gap looks specific to this skill rather than a foundation issue.',
    };
  }

  const top = weakPrereqs[0];
  const bothHaveDecentEvidence = targetState.confidence !== 'LOW' && top.state.confidence !== 'LOW';
  const confidence: RootCauseSignal['confidence'] = bothHaveDecentEvidence ? 'moderate' : 'low';

  return {
    target_skill: params.targetSkillCode,
    possible_prerequisite_gap: top.code,
    evidence: {
      target_capability: targetState.capability,
      prerequisite_capability: top.state.capability,
    },
    confidence,
    note: 'A structurally related prerequisite is also below threshold. This is a correlation-based signal, not a confirmed cause — evidence on both skills should keep accumulating before treating it as settled.',
  };
}
