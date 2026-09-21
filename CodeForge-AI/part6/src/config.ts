import type { MasteryLevel, PriorityTier, GapStatus, ReadinessState } from './domain/types';

export const MASTERY_LEVELS: MasteryLevel[] = ['NOVICE', 'DEVELOPING', 'COMPETENT', 'STRONG', 'MASTERED'];

export function masteryRank(level: MasteryLevel | null): number | null {
  if (level === null) return null;
  const idx = MASTERY_LEVELS.indexOf(level);
  return idx === -1 ? null : idx;
}

export function rankToMastery(rank: number): MasteryLevel {
  const clamped = Math.max(0, Math.min(MASTERY_LEVELS.length - 1, Math.round(rank)));
  return MASTERY_LEVELS[clamped];
}

export const PRIORITY_TIER_WEIGHT: Record<PriorityTier, number> = {
  LOW: 0.25,
  MEDIUM: 0.5,
  HIGH: 0.75,
  CRITICAL: 1.0,
};

// How severe each gap classification is treated for prioritization purposes.
// UNKNOWN is deliberately moderate (not high, not zero) — Phase 6 requires
// treating "unknown" as "needs assessment", never silently as "weak".
export const GAP_SEVERITY_WEIGHT: Record<GapStatus, number> = {
  COMPLETE: 0,
  DEVELOPING: 0.4,
  GAP: 0.7,
  CRITICAL_GAP: 1.0,
  UNKNOWN: 0.5,
  INSUFFICIENT_EVIDENCE: 0.55,
  BLOCKED: 0,
};

// Weights sum to 1.0 so each contribution is directly interpretable as a
// percentage of the final priority score — this is what keeps the priority
// engine explainable instead of an opaque black box (Phase 9).
export const PRIORITY_WEIGHTS = {
  role: 0.25,
  gap: 0.3,
  block: 0.2,
  required: 0.1,
  urgency: 0.1,
  trend: 0.05,
};

export const MILESTONE_COMPLETION_DEFAULTS = {
  requiredSkillsAtTarget: true,
  minConfidence: 0.6,
  minIndependentEvidencePerRequiredSkill: 2,
  verificationRequired: true,
};

export const READINESS_BANDS: Array<{ max: number; state: ReadinessState }> = [
  { max: 0.1, state: 'NOT_STARTED' },
  { max: 0.35, state: 'FOUNDATION_BUILDING' },
  { max: 0.6, state: 'DEVELOPING' },
  { max: 0.8, state: 'APPROACHING_READY' },
  { max: 0.95, state: 'READY' },
  { max: 1.01, state: 'STRONG' },
];

// Readiness gates (Phase 26): a composite score alone can never produce
// READY/STRONG — the gate must also pass. This is what prevents an LLM (or
// anything else) from arbitrarily declaring someone "interview ready".
export const READINESS_GATES: Record<
  string,
  { requiredDimensionMin: number; requireRecentVerification: boolean; minOverallConfidence: number }
> = {
  INTERVIEW_READY: { requiredDimensionMin: 0.8, requireRecentVerification: true, minOverallConfidence: 0.6 },
};

export const DEFAULT_PREREQ_TARGET: MasteryLevel = 'COMPETENT';
export const URGENCY_BASELINE_DAYS = 90;
export const MAX_SKILLS_PER_MILESTONE = 5;
export const REVIEW_STALE_DAYS = 21; // spaced review threshold (Phase 32)
