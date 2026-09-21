import type { Domain, EvidenceStrength, GapType, PriorityBreakdown, Skill, SkillRelationship } from '../domain/types.js';

const GAP_SEVERITY_WEIGHT: Record<GapType, number> = {
  KNOWLEDGE_GAP: 0.9,
  APPLICATION_GAP: 0.8,
  TRANSFER_GAP: 0.6,
  SPEED_GAP: 0.5,
  CONSISTENCY_GAP: 0.55,
  RETENTION_GAP: 0.5,
  INSUFFICIENT_EVIDENCE: 0.1,
};

const EVIDENCE_CONFIDENCE: Record<EvidenceStrength, number> = {
  NONE: 0,
  LOW: 0.3,
  MODERATE: 0.6,
  HIGH: 0.85,
  VERIFIED: 1,
};

export function countDownstream(skillId: string, relationships: SkillRelationship[]): number {
  return relationships.filter(
    (r) => r.fromSkillId === skillId && (r.type === 'PREREQUISITE_OF' || r.type === 'SUPPORTS'),
  ).length;
}

export function computePriority(params: {
  skill: Skill;
  state: { capability: string; evidenceStrength: EvidenceStrength; gapTypes: GapType[] };
  downstreamCount: number;
  maxDownstreamCount: number;
  targetDomains: Domain[];
  daysToTarget: number | null;
}): PriorityBreakdown {
  const { skill, state, downstreamCount, maxDownstreamCount, targetDomains, daysToTarget } = params;

  const gapSeverity = state.gapTypes.length === 0 ? 0 : Math.max(...state.gapTypes.map((g) => GAP_SEVERITY_WEIGHT[g]));
  const downstreamImpact = maxDownstreamCount === 0 ? 0 : downstreamCount / maxDownstreamCount;
  const goalRelevance = targetDomains.includes(skill.domain) ? 1 : 0.4;

  let urgency = 0.3;
  if (daysToTarget !== null) {
    urgency = daysToTarget <= 7 ? 1 : daysToTarget <= 21 ? 0.8 : daysToTarget <= 45 ? 0.5 : 0.3;
  }

  const evidenceConfidence = EVIDENCE_CONFIDENCE[state.evidenceStrength];

  const rawScore = gapSeverity * 0.35 + downstreamImpact * 0.25 + goalRelevance * 0.2 + urgency * 0.2;
  // Confidence dampens the score but never zeroes it out entirely — a
  // low-confidence flag should rank lower than a well-evidenced one, not vanish.
  const score = Math.round(rawScore * (0.4 + 0.6 * evidenceConfidence) * 100) / 100;

  const reasons: string[] = [];
  if (gapSeverity >= 0.7) {
    reasons.push(`${skill.name} shows a real gap (${state.gapTypes.join(', ').toLowerCase().replace(/_/g, ' ')})`);
  }
  if (downstreamCount > 0) {
    reasons.push(`Supports ${downstreamCount} downstream skill${downstreamCount > 1 ? 's' : ''}`);
  }
  if (targetDomains.includes(skill.domain)) {
    reasons.push(`Directly relevant to the stated goal domain (${skill.domain})`);
  }
  if (daysToTarget !== null && daysToTarget <= 21) {
    reasons.push(`Target is ${daysToTarget} days away`);
  }
  if (evidenceConfidence < 0.6) {
    reasons.push(`Evidence is still ${state.evidenceStrength.toLowerCase()} — treat this as a provisional signal`);
  }

  return { gapSeverity, downstreamImpact, goalRelevance, urgency, evidenceConfidence, score, reasons };
}
