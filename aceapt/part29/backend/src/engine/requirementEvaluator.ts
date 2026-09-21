import {
  CAPABILITY_LEVEL_SCORE,
  CapabilityDna,
  CapabilityLevel,
  ConfidenceBand,
  ImportanceTier,
  TargetCapabilityRequirement,
  TargetProfile,
} from '../domain/types';
import { findEntry } from './capabilityDna';
import { capabilityName as lookupCapabilityName } from '../config/capabilities';

/**
 * A CORE requirement met at less than this fraction of its required level
 * is a critical gap — strong supporting skills can never buy it back
 * (spec §19). Chosen so a student who is "close" (e.g. MEDIUM against a
 * STRONG bar, ~0.74) reads as a real but non-critical gap, while someone
 * clearly short (e.g. WEAK against STRONG, ~0.28) is flagged critical.
 */
export const CRITICAL_GAP_RATIO = 0.75;

export interface RequirementEvaluation {
  capabilityId: string;
  capabilityName: string;
  importance: ImportanceTier;
  requiredLevel: CapabilityLevel;
  requiredLevelScore: number;

  hasEvidence: boolean;
  currentLevel: CapabilityLevel | null;
  currentLevelScore: number; // 0 when hasEvidence is false
  hasVerifiedEvidence: boolean;
  confidenceBand: ConfidenceBand;
  confidenceScore: number;

  /** min(1, current/required) — used for FIT. */
  achievementRatio: number;
  /** Same, but 0 unless the evidence backing it is proof-verified — used for READINESS. */
  verifiedAchievementRatio: number;

  deficit: number; // requiredLevelScore - currentLevelScore, floor 0
  isCriticalGap: boolean;
  isMet: boolean; // achievementRatio >= 1
}

function evaluateOne(dna: CapabilityDna, req: TargetCapabilityRequirement): RequirementEvaluation {
  const entry = findEntry(dna, req.capabilityId);
  const requiredLevelScore = CAPABILITY_LEVEL_SCORE[req.requiredLevel];

  const hasEvidence = entry !== null;
  const currentLevelScore = entry?.levelScore ?? 0;
  const achievementRatio = requiredLevelScore > 0
    ? Math.min(1, currentLevelScore / requiredLevelScore)
    : 1;

  const verifiedAchievementRatio = entry?.hasVerifiedEvidence ? achievementRatio : 0;

  const deficit = Math.max(0, requiredLevelScore - currentLevelScore);
  const isCriticalGap =
    req.importance === 'CORE' && achievementRatio < CRITICAL_GAP_RATIO;

  return {
    capabilityId: req.capabilityId,
    capabilityName: entry?.capabilityName ?? lookupCapabilityName(req.capabilityId),
    importance: req.importance,
    requiredLevel: req.requiredLevel,
    requiredLevelScore,
    hasEvidence,
    currentLevel: entry?.level ?? null,
    currentLevelScore,
    hasVerifiedEvidence: entry?.hasVerifiedEvidence ?? false,
    confidenceBand: entry?.confidence.band ?? 'LOW',
    confidenceScore: entry?.confidence.score ?? 0,
    achievementRatio,
    verifiedAchievementRatio,
    deficit,
    isCriticalGap,
    isMet: achievementRatio >= 1,
  };
}

export function evaluateRequirements(
  dna: CapabilityDna,
  target: TargetProfile,
): RequirementEvaluation[] {
  return target.requirements.map((req) => evaluateOne(dna, req));
}
