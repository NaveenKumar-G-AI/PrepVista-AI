// =============================================================================
// All tunable thresholds and weights for the adaptive engine live here.
// Nothing below is hardcoded into estimator/detector/ranking logic itself —
// changing a number here changes system behavior without touching algorithms.
// In production these would be a DB-backed config table with an admin UI;
// here they are a single typed module, which is the honest reference-impl
// equivalent (see CODEFORGE_MASTERY_MODEL.md for how each constant is used).
// =============================================================================

export const config = {
  mastery: {
    // Exponential recency decay half-life, in days. Evidence this many days
    // old contributes half the weight of fresh evidence. Evidence is never
    // deleted (Phase 9) — only its influence on the live score decays.
    recencyHalfLifeDays: 21,

    // Linear map from a challenge's 1-10 difficultyScore to a weight
    // multiplier applied to that piece of evidence.
    difficultyWeightMin: 0.7,
    difficultyWeightMax: 1.5,

    // Independence multipliers by assistance level (Phase 6/7 — independent
    // performance counts more than assisted performance).
    independenceMultiplier: {
      NONE: 1.0,
      HINT: 0.75,
      SOLUTION_VIEWED: 0.4,
    } as Record<'NONE' | 'HINT' | 'SOLUTION_VIEWED', number>,

    // If the same mistakeCategory appears in at least this fraction of the
    // last `repeatedMistakeWindow` pieces of evidence, apply a penalty —
    // this is what lets the engine notice "same mistake, attempt after
    // attempt" (Phase 23) rather than only looking at the raw pass rate.
    repeatedMistakeWindow: 3,
    repeatedMistakeThresholdFraction: 0.6,
    repeatedMistakePenalty: 0.85,

    // Prerequisite gating (Phase 12): if a required prerequisite skill is
    // still at or below this mastery_score (0-100), the DEPENDENT skill's
    // effective mastery is capped, no matter how good its own raw evidence
    // looks — a lucky pass on an advanced skill can't outrun a missing
    // foundation.
    prerequisiteReadinessScoreThreshold: 35,
    prerequisiteCapScore: 55,

    // Mastery state gating (Phase 5/62): thresholds are score-only floors;
    // COMPETENT and above additionally require the evidence-count /
    // independence / diversity gates below, specifically so a single lucky
    // attempt can never reach a high state.
    stateScoreThresholds: {
      INTRODUCED: 1,
      EXPLORING: 20,
      DEVELOPING: 40,
      COMPETENT: 55,
      STRONG: 70,
      ADVANCED: 85,
      MASTERED: 93,
    },
    stateGates: {
      COMPETENT: { minEvidenceCount: 3 },
      STRONG: { minEvidenceCount: 4, minIndependentSuccesses: 2 },
      ADVANCED: { minEvidenceCount: 5, minIndependentSuccesses: 3, minConfidence: 70, minDistinctDifficultyLevels: 2 },
      MASTERED: { minEvidenceCount: 6, minIndependentSuccesses: 4, minConfidence: 85, minDistinctChallenges: 3, requiresVerification: true },
    },
  },

  confidence: {
    targetEvidenceCount: 6,       // evidence volume saturates confidence at this count
    targetDistinctChallenges: 4,  // diversity saturates at this many distinct challenges
    contradictionPenaltyMultiplier: 0.7,
    weights: {
      volume: 0.35,
      diversity: 0.3,
      independence: 0.25,
      recencySpread: 0.1,
    },
  },

  trend: {
    windowSize: 6,                 // look at the last N evidence rows (chronological)
    minPointsRequired: 3,          // fewer than this => INSUFFICIENT_DATA
    slopeImprovingThreshold: 0.05, // normalized-score-per-step
    slopeDecliningThreshold: -0.05,
    inconsistentVarianceThreshold: 0.075,
  },

  contradiction: {
    // Evidence is "contradictory" when a harder attempt succeeds shortly
    // after (or instead of) an easier one fails, without an intervening
    // explanation (assistance, large time gap, different context type).
    minDifficultyGapForContradiction: 2.5,
    lookbackCount: 5,
  },

  gaps: {
    complexityTimeoutSignalsComplexityGap: true,
    transferGapMinStandardScore: 0.6,   // "does fine on STANDARD" floor
    transferGapMaxNovelScore: 0.4,      // "struggles on NOVEL" ceiling
    retentionGapDeclineThreshold: 20,   // mastery_score drop that suggests decay
    retentionGapMinGapDays: 14,
    insufficientEvidenceMinCount: 2,
  },

  difficulty: {
    // Consecutive independent successes at the current level before the
    // adaptive difficulty pointer steps up.
    consecutiveSuccessesToIncrease: 2,
    // Consecutive failures before the pointer steps down into a recovery
    // path instead of continuing to escalate (Phase 17).
    consecutiveFailuresToDecrease: 2,
    levels: ['EASY', 'MEDIUM', 'HARD', 'ADVANCED'] as const,
  },

  ranking: {
    // Default weight vector for candidate ranking (Phase 19). All signals
    // are normalized to [0,1] (repetitionPenalty is subtracted).
    weights: {
      skillGap: 0.20,
      prerequisiteFit: 0.12,
      difficultyFit: 0.14,
      roleRelevance: 0.12,
      goalRelevance: 0.08,
      learningValue: 0.10,
      freshness: 0.06,
      diversity: 0.06,
      mistakeRelevance: 0.10,
      retentionValue: 0.06,
      repetitionPenalty: 0.18, // subtracted
    },
    recentExposureExcludeDays: 3, // don't resurface a just-completed challenge unless targeted repetition
  },

  exploration: {
    // Fraction of recommendation cycles that deliberately probe an UNKNOWN
    // skill instead of only targeting known gaps (Phase 20/21).
    baseExplorationRate: 0.15,
  },

  spacedReview: {
    reviewIntervalDaysByState: {
      COMPETENT: 10,
      STRONG: 14,
      ADVANCED: 21,
      MASTERED: 30,
    } as Partial<Record<MasteryStateKey, number>>,
  },

  fatigue: {
    recentFailureWindow: 4,
    recentFailureRateThreshold: 0.75, // 3 of last 4 failed => signal fatigue/struggle
    longAttemptSeconds: 240,
  },

  ai: {
    timeoutMs: 8000,
    provider: (process.env.AI_PROVIDER as 'groq' | 'gemini' | 'none') || 'none',
    groqModel: 'llama-3.1-8b-instant',
    geminiModel: 'gemini-1.5-flash',
  },
};

type MasteryStateKey = 'COMPETENT' | 'STRONG' | 'ADVANCED' | 'MASTERED';

export type Config = typeof config;
