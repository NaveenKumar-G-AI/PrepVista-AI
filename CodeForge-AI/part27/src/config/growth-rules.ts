/**
 * Every threshold the growth engine uses lives here, and nowhere else.
 * Sections 64-65 of the spec are explicit: "if score > 82" is forbidden;
 * "growthRules.masteryThreshold" is required. If you're tempted to write a
 * number directly in an engine file, it belongs in this file instead.
 *
 * Bump GROWTH_MODEL_VERSION whenever a threshold changes. Historical
 * SkillState snapshots record the version they were computed under
 * (section 52), so old conclusions stay interpretable even after the rules
 * move — you are never rewriting history by tuning these numbers.
 */

import type { EvidenceQuality } from '../types/evidence.js';

export const GROWTH_MODEL_VERSION = '2026.08.1';
export const EVIDENCE_MODEL_VERSION = '2026.08.1';
export const SKILL_MODEL_VERSION_FALLBACK = 'external-unversioned';

export type ConfidenceLevel = 'LOW' | 'MODERATE' | 'HIGH';

export const growthRules = {
  version: GROWTH_MODEL_VERSION,

  confidence: {
    // Evidence-quality weighting — deterministic, machine-verified outcomes
    // dominate; a student's own claim about their understanding is the
    // weakest signal in the system (section 8).
    // Typed as a total map over EvidenceQuality (not Record<string, number>)
    // so the compiler itself guarantees every evidence quality has a
    // defined weight — one less way for this file to drift from
    // types/evidence.ts as new evidence qualities get added.
    weight: {
      DETERMINISTIC: 1.0,
      DIRECT: 0.9,
      INDIRECT: 0.6,
      INFERRED: 0.5,
      AI_ASSISTED: 0.4,
      SELF_REPORTED: 0.15,
    } as Record<EvidenceQuality, number>,
    minEvidenceForModerate: 3,
    minEvidenceForHigh: 8,
    minDistinctSourcesForHigh: 3,
    // Recency half-life, in days, applied to each evidence record's weight
    // when aggregating — old evidence still counts, it just counts less.
    recencyHalfLifeDays: 45,
  },

  masteryThreshold: 0.88,
  proficientThreshold: 0.72,
  practicedThreshold: 0.5,
  developingThreshold: 0.28,
  minEvidenceForMastery: 6,
  minConfidenceLevelForMastery: 'HIGH' as ConfidenceLevel,

  // How many aggregate score points a state is allowed to move in one
  // update without extra corroboration. This is the formal version of
  // section 12 ("do not overreact") — it's what stops one hard win or one
  // careless slip from swinging the label two tiers.
  maxStateStepsPerUpdateWithoutCorroboration: 1,

  regression: {
    minConsecutiveNegative: 3,
    windowDays: 14,
    // Drop in rolling aggregate score, from the prior stable score, mapped
    // to severity bands (section 23).
    severityBands: {
      MINOR: 0.05,
      MODERATE: 0.12,
      SIGNIFICANT: 0.22,
      CRITICAL: 0.35,
    },
  },

  recovery: {
    minPositiveEvidenceAfterDecline: 2,
    minPositiveRatioAfterDecline: 0.6,
  },

  retention: {
    staleAfterDays: 21,
    atRiskAfterDays: 45,
    reinforcementRequiredAfterDays: 60,
  },

  transfer: {
    minTransferAttemptsForSignal: 2,
    strongTransferSuccessRate: 0.75,
    moderateTransferSuccessRate: 0.5,
  },

  trajectory: {
    // Minimum evidence records required inside a comparison window before
    // its score is trusted for a trend judgement (section 15/16 — no
    // fake-precise trend off one data point).
    minEvidencePerWindow: 2,
    minEvidenceForFallbackTrend: 4,
    rapidlyImprovingDelta: 0.25,
    improvingDelta: 0.08,
    // |delta| below this is STABLE, not a rounding error being reported as a trend.
    stableBand: 0.08,
    decliningDelta: -0.08,
    // How much smaller the current delta has to be than the prior delta
    // (while both are still positive) to call it SLOWING rather than IMPROVING.
    slowingMargin: 0.06,
  },

  bottleneck: {
    // A skill/category is flagged as the bottleneck when it sits at least
    // this many aggregate-score points below the average of the student's
    // other proficient-or-better categories.
    minGapBelowPeersToFlag: 0.2,
    minPeerCategoriesProficient: 2,
  },

  milestones: {
    minConfidenceScore: 0.6,
  },

  timeWindows: {
    recentDays: 7,
    shortTermDays: 14,
    mediumTermDays: 30,
    longTermDays: 90,
  },

  insights: {
    // Never call an LLM for a window with fewer than this many evidence
    // records backing it — section 102, cost control + section 82,
    // hallucination defense (too little evidence is exactly when a model
    // is most likely to pad the gap with something invented).
    minEvidenceForAiSummary: 3,
  },
} as const;

export type GrowthRules = typeof growthRules;
