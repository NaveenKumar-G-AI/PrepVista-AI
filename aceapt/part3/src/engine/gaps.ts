import type { FreshnessState, GapType, SkillEvidence, SubCapabilityRead } from '../domain/types.js';

function isWeak(r: SubCapabilityRead): boolean {
  return r.evidenceCount >= 2 && (r.state === 'DEVELOPING' || r.state === 'LIMITED_EVIDENCE');
}

export function detectGaps(params: {
  evidenceCount: number;
  foundation: SubCapabilityRead;
  application: SubCapabilityRead;
  transfer: SubCapabilityRead;
  speedIssue: boolean;
  isContradictory: boolean;
  freshness: FreshnessState;
  wasStrongBefore: boolean;
}): GapType[] {
  const { evidenceCount, foundation, application, transfer, speedIssue, isContradictory, freshness, wasStrongBefore } =
    params;

  if (evidenceCount < 2) return ['INSUFFICIENT_EVIDENCE'];

  const gaps: GapType[] = [];

  // Walk foundation -> application -> transfer and flag the first weak point.
  // Note this deliberately does NOT require the prior level to be explicitly
  // "solid" — a skill that is application-only by taxonomy (most are) will
  // always show zero foundation evidence for itself, and that must not
  // block an application gap from being reported. Cross-skill foundation
  // checks (e.g. "is the prerequisite skill itself solid?") are handled
  // separately by the prerequisite/relationship engine in profile.ts.
  if (isWeak(foundation)) {
    gaps.push('KNOWLEDGE_GAP');
  } else if (isWeak(application)) {
    gaps.push('APPLICATION_GAP');
  } else if (isWeak(transfer)) {
    gaps.push('TRANSFER_GAP');
  }

  if (speedIssue) gaps.push('SPEED_GAP');
  if (isContradictory) gaps.push('CONSISTENCY_GAP');
  if (freshness === 'STALE' && wasStrongBefore) gaps.push('RETENTION_GAP');

  return gaps;
}

/** Accurate + slow is a different finding from accurate + fast, or wrong + slow.
 *  Only flag a speed gap when accuracy is otherwise reasonable — if the student
 *  is also getting it wrong, timing isn't the primary story. */
export function detectSpeedIssue(evidence: SkillEvidence[]): boolean {
  const withTiming = evidence.filter((e) => e.expectedTimeMs > 0);
  if (withTiming.length < 2) return false;
  const avgRatio = withTiming.reduce((s, e) => s + e.timeTakenMs / e.expectedTimeMs, 0) / withTiming.length;
  const accuracy = withTiming.filter((e) => e.correct).length / withTiming.length;
  return avgRatio >= 1.4 && accuracy >= 0.6;
}
