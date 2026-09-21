/**
 * Versioned policy. Engine modules read thresholds/weights from here — never
 * inline. Bumping POLICY_VERSION is how a scoring-rule change becomes
 * auditable: every persisted signal stamps the policy version it was
 * computed under (see domain/models.ts SkillSignal.policyVersion), so a past
 * signal stays interpretable even after the policy changes (req. #52/#97).
 */
import type { SkillId } from '../domain/models.js';

export const POLICY_VERSION = 'signal-policy-v1';

export const SignalPolicy = {
  version: POLICY_VERSION,

  /** How much each evidence TYPE is trusted by default (req. #10, #33). Self-reported
   * "understanding" evidence is real signal but must not silently outrank a deterministic
   * execution result. */
  sourceReliability: {
    CORRECTNESS_RESULT: 0.95,
    CHALLENGE_RESULT: 0.9,
    ASSESSMENT_RESULT: 0.97,
    COMPLEXITY_RESULT: 0.85,
    QUALITY_RESULT: 0.8,
    DEBUGGING_RESULT: 0.88,
    REASONING_RESULT: 0.75,
    TRANSFER_RESULT: 0.9,
    UNDERSTANDING_RESULT: 0.45, // self-reported — capped, see req. #10
  } as Record<string, number>,

  /** Multiplier applied on top of sourceReliability by assessment tier (req. #33). */
  assessmentTierMultiplier: {
    PRACTICE: 0.85,
    DIAGNOSTIC: 0.95,
    ASSESSMENT: 1.0,
    PROJECT: 1.05,
    INTERVIEW: 1.05,
  } as Record<string, number>,

  aggregation: {
    /** Evidence older than this many days is "historical"; within it is "recent" (req. #13). */
    recentWindowDays: 21,
    /** Exponential recency decay half-life used inside each window (req. #14). */
    recencyHalfLifeDays: 45,
  },

  confidence: {
    /** Confidence-from-count saturates like 1 - e^(-n/k); k = this constant (req. #15). */
    countSaturationK: 6,
    /** Distinct context groups needed before diversity stops penalizing confidence (req. #16). */
    diversityTargetContexts: 4,
    /** Max confidence haircut applied when contradiction is detected (req. #22). */
    contradictionPenaltyMax: 0.4,
    /** Confidence multiplier floor when every observation is self-reported (req. #10). */
    selfReportedReliabilityCap: 0.5,
  },

  freshness: {
    recentDays: 14,
    agingDays: 45,
    staleDays: 120,
  },

  state: {
    /** Signal thresholds for the base ladder (req. #19/#20). */
    thresholds: {
      developing: 0.35,
      practiced: 0.55,
      proficient: 0.72,
      mastered: 0.85,
    },
    masteryMinConfidence: 0.75,
    masteryMinDiversity: 0.55,
    /** A MASTERED skill demotes only on sustained/authoritative evidence, never one bad
     * result (req. #20). Non-authoritative recent evidence needs this many consistent
     * low points before demotion proceeds past AT_RISK into REGRESSING. */
    demotionSustainedPointsRequired: 2,
    /** Confidence below this always forces UNCERTAIN regardless of signal (req. #21/#40). */
    uncertaintyConfidenceFloor: 0.3,
  },

  trend: {
    minHistoryPoints: 3,
    improveSlopeThreshold: 0.03,
    declineSlopeThreshold: -0.03,
    volatilityStdDevThreshold: 0.16,
  },

  diversity: {
    targetDistinctContexts: 4,
  },

  transfer: {
    /** Confidence needed before a transfer gap is reported at all — avoids
     * "insufficient data" masquerading as "transfer weakness" (req. #17/#30). */
    minEvidenceForTransferSignal: 1,
  },

  retention: {
    /** A recheck counts as a retention check only after this many days of silence (req. #29). */
    minGapDaysForRetentionCheck: 30,
  },

  strengthWeaknessDetection: {
    strengthMinSignal: 0.72,
    strengthMinConfidence: 0.65,
    weaknessMaxSignal: 0.4,
    weaknessMinConfidence: 0.55, // low confidence => UNCERTAIN, not "weakness" (req. #39/#40)
    weaknessMinEvidenceCount: 2, // one failure is never a weakness (req. #39)
  },
} as const;

/** Seed skill catalog for this reference build. Extensible — add rows to `skills`
 * table / this map rather than hardcoding new skills into engine logic (req. #7). */
export const SKILL_CATALOG: Record<SkillId, { name: string; dimensionGroup: string }> = {
  algorithms: { name: 'Algorithms', dimensionGroup: 'problem_solving' },
  state_reasoning: { name: 'State Reasoning', dimensionGroup: 'algorithmic_reasoning' },
  complexity_reasoning: { name: 'Complexity Reasoning', dimensionGroup: 'algorithmic_reasoning' },
  debugging: { name: 'Debugging', dimensionGroup: 'debugging' },
  code_quality: { name: 'Code Quality', dimensionGroup: 'maintainability' },
  understanding: { name: 'Understanding', dimensionGroup: 'understanding' },
};

/** Prerequisite edges for readiness queries (req. #25). skillId requires requiresSkillId
 * to be at least at minState. */
export const SKILL_PREREQUISITES: Array<{ skillId: SkillId; requiresSkillId: SkillId; minState: string }> = [
  { skillId: 'complexity_reasoning', requiresSkillId: 'algorithms', minState: 'PRACTICED' },
  { skillId: 'debugging', requiresSkillId: 'code_quality', minState: 'DEVELOPING' },
];
