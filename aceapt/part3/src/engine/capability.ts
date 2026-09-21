import { CAPABILITY_LADDER } from '../domain/types.js';
import type { CapabilityState, CognitiveLevel, EvidenceStrength, SkillEvidence, SubCapabilityRead } from '../domain/types.js';

/**
 * Evidence Strength answers "how much do we trust this read?" — kept
 * completely separate from capability, which answers "what does the read
 * say?". This is what stops two lucky answers from being reported as
 * Mastered.
 */
export function computeEvidenceStrength(evidence: SkillEvidence[]): EvidenceStrength {
  const n = evidence.length;
  if (n === 0) return 'NONE';

  const sessions = new Set(evidence.map((e) => e.sessionId)).size;
  const difficultyBands = new Set(evidence.map((e) => Math.ceil(e.difficulty))).size;
  const hasRetest = evidence.some((e) => e.source === 'retest');

  if (n >= 6 && sessions >= 3 && difficultyBands >= 2) {
    return hasRetest ? 'VERIFIED' : 'HIGH';
  }
  if (n >= 3 || sessions >= 2) return 'MODERATE';
  return 'LOW';
}

/** Recency-weighted, difficulty-adjusted accuracy, 0–1. Deliberately simple —
 *  a full IRT model is more than this prototype needs. */
export function rawAccuracySignal(evidence: SkillEvidence[]): number {
  if (evidence.length === 0) return 0;
  const now = Date.now();
  let weightedSum = 0;
  let weightTotal = 0;
  for (const e of evidence) {
    const ageDays = Math.max(0, (now - new Date(e.createdAt).getTime()) / 86_400_000);
    const recencyWeight = Math.exp(-ageDays / 30); // ~30-day half-life-ish decay
    const difficultyWeight = 0.6 + e.difficulty / 10; // harder correct answers count a bit more
    const w = recencyWeight * difficultyWeight;
    weightedSum += w * (e.correct ? 1 : 0);
    weightTotal += w;
  }
  return weightTotal === 0 ? 0 : weightedSum / weightTotal;
}

export function signalToCapability(score: number): CapabilityState {
  if (score >= 0.88) return 'MASTERED';
  if (score >= 0.78) return 'ADVANCED';
  if (score >= 0.66) return 'STRONG';
  if (score >= 0.52) return 'FUNCTIONAL';
  if (score >= 0.36) return 'DEVELOPING';
  if (score >= 0.18) return 'EMERGING';
  return 'LIMITED_EVIDENCE';
}

const TIER_CAP: Record<EvidenceStrength, CapabilityState> = {
  NONE: 'NOT_ASSESSED',
  LOW: 'EMERGING',
  MODERATE: 'FUNCTIONAL',
  HIGH: 'ADVANCED',
  VERIFIED: 'MASTERED',
};

/** The gating rule: a raw signal can never be displayed as more confident
 *  than the evidence backing it. */
export function capCapability(raw: CapabilityState, tier: EvidenceStrength): CapabilityState {
  if (tier === 'NONE') return 'NOT_ASSESSED';
  const rawIdx = CAPABILITY_LADDER.indexOf(raw);
  const capIdx = CAPABILITY_LADDER.indexOf(TIER_CAP[tier]);
  return CAPABILITY_LADDER[Math.min(rawIdx, capIdx)];
}

export function capabilityRank(state: CapabilityState): number {
  return CAPABILITY_LADDER.indexOf(state);
}

/** Foundation / application / transfer each get a lightweight, independent
 *  read rather than a full duplicate of the capability ladder. */
export function subCapabilityRead(evidence: SkillEvidence[], level: CognitiveLevel): SubCapabilityRead {
  const relevant = evidence.filter((e) => e.cognitiveLevel === level);
  const n = relevant.length;
  if (n < 2) return { state: 'LIMITED_EVIDENCE', evidenceCount: n };
  const correct = relevant.filter((e) => e.correct).length;
  const rate = correct / n;
  const state: SubCapabilityRead['state'] = rate >= 0.75 ? 'STRONG' : rate >= 0.5 ? 'SOLID' : 'DEVELOPING';
  return { state, evidenceCount: n };
}
