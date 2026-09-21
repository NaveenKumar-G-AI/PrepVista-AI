import type { EvidenceStrength, FreshnessState, SkillEvidence } from '../domain/types.js';

/**
 * Contradictory evidence (Strong one session, weak the next) is a signal,
 * not a bug — it shouldn't be silently averaged away. This checks whether
 * per-session accuracy swings wide enough to warrant flagging.
 */
export function detectContradiction(evidence: SkillEvidence[]): boolean {
  const bySession = new Map<string, SkillEvidence[]>();
  for (const e of evidence) {
    const list = bySession.get(e.sessionId) ?? [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  const sessionAccuracies = [...bySession.values()]
    .filter((list) => list.length >= 2)
    .map((list) => list.filter((e) => e.correct).length / list.length);

  if (sessionAccuracies.length < 2) return false;
  const max = Math.max(...sessionAccuracies);
  const min = Math.min(...sessionAccuracies);
  return max - min >= 0.6;
}

/** A contradiction found should dampen confidence rather than let a HIGH/VERIFIED
 *  tier stand unquestioned. */
export function adjustEvidenceStrengthForContradiction(
  tier: EvidenceStrength,
  isContradictory: boolean,
): EvidenceStrength {
  if (!isContradictory) return tier;
  if (tier === 'HIGH' || tier === 'VERIFIED') return 'MODERATE';
  return tier;
}

export function computeFreshness(evidence: SkillEvidence[]): FreshnessState {
  if (evidence.length === 0) return 'UNKNOWN';
  const mostRecent = Math.max(...evidence.map((e) => new Date(e.createdAt).getTime()));
  const ageDays = (Date.now() - mostRecent) / 86_400_000;
  if (ageDays <= 7) return 'FRESH';
  if (ageDays <= 21) return 'RECENT';
  if (ageDays <= 45) return 'AGING';
  return 'STALE';
}
