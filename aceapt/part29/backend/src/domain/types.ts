/**
 * ACEAPT FEATURE 29 — ALIGN
 * Core domain vocabulary.
 *
 * This file is intentionally the one place that defines what "fit",
 * "readiness", "confidence" and "gap" mean structurally. Every engine
 * module imports from here rather than redefining shapes locally, so the
 * spec's central rule — fit and readiness are never collapsed into one
 * number — is enforced by the type system, not just by convention.
 */

// ---------------------------------------------------------------------------
// Capability levels
// ---------------------------------------------------------------------------

/** Ordered weak → strong. Order matters — several engines compare by index. */
export const CAPABILITY_LEVELS = [
  'VERY_WEAK',
  'WEAK',
  'DEVELOPING',
  'MEDIUM',
  'STRONG',
  'VERY_STRONG',
] as const;

export type CapabilityLevel = (typeof CAPABILITY_LEVELS)[number];

/** 0..1 numeric anchor for each level, used by the deterministic engines. */
export const CAPABILITY_LEVEL_SCORE: Record<CapabilityLevel, number> = {
  VERY_WEAK: 0.05,
  WEAK: 0.22,
  DEVELOPING: 0.4,
  MEDIUM: 0.58,
  STRONG: 0.78,
  VERY_STRONG: 0.95,
};

export function levelFromScore(score: number): CapabilityLevel {
  const clamped = Math.max(0, Math.min(1, score));
  // Midpoints between the anchors above.
  if (clamped < 0.135) return 'VERY_WEAK';
  if (clamped < 0.31) return 'WEAK';
  if (clamped < 0.49) return 'DEVELOPING';
  if (clamped < 0.68) return 'MEDIUM';
  if (clamped < 0.865) return 'STRONG';
  return 'VERY_STRONG';
}

// ---------------------------------------------------------------------------
// Evidence
// ---------------------------------------------------------------------------

/**
 * One observed data point backing a capability. This mirrors the kind of
 * row that should already exist somewhere in ACEAPT's assessment/attempt
 * tables (Feature 3/5/6/8/20) — ALIGN does not originate evidence, it
 * consumes it. The adapter in `integrations/evidenceSource.ts` is the
 * seam where you map your real tables onto this shape.
 */
export interface CapabilityEvidenceEvent {
  capabilityId: string;
  /** 0..1 raw performance signal for this single event. */
  performance: number;
  occurredAt: string; // ISO timestamp
  difficulty: number; // 0..1
  novelty: number; // 0..1 — how unfamiliar/novel the item was (transfer signal)
  timed: boolean;
  /** True only if this event came through Feature 28 (PROOF) verification. */
  proofVerified: boolean;
  /** Optional pointer back to the source assessment/attempt for auditability. */
  sourceRef?: string;
}

/**
 * Evidence confidence is deliberately a first-class, separate value from
 * capability level (spec section 12). A STRONG capability built on one
 * lucky attempt should read differently from a STRONG capability built on
 * a dozen consistent, recent, varied-difficulty attempts.
 */
export type ConfidenceBand = 'LOW' | 'MEDIUM' | 'HIGH';

export interface EvidenceConfidence {
  band: ConfidenceBand;
  /** 0..1 underlying continuous score, kept for what-if math and sorting. */
  score: number;
  attemptCount: number;
  proofVerifiedCount: number;
  mostRecentAt: string | null;
  reasons: string[]; // short, human-checkable factors that produced the band
}

// ---------------------------------------------------------------------------
// Capability DNA
// ---------------------------------------------------------------------------

export interface CapabilityDnaEntry {
  capabilityId: string;
  capabilityName: string;
  level: CapabilityLevel;
  levelScore: number; // 0..1, same scale as CAPABILITY_LEVEL_SCORE
  confidence: EvidenceConfidence;
  /** True once at least one contributing event is proofVerified. */
  hasVerifiedEvidence: boolean;
  evidenceEventCount: number;
}

export interface CapabilityDna {
  studentId: string;
  generatedAt: string;
  entries: CapabilityDnaEntry[];
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export type ImportanceTier = 'CORE' | 'IMPORTANT' | 'SUPPORTING';

export const IMPORTANCE_WEIGHT: Record<ImportanceTier, number> = {
  CORE: 1.0,
  IMPORTANT: 0.6,
  SUPPORTING: 0.3,
};

export interface TargetCapabilityRequirement {
  capabilityId: string;
  importance: ImportanceTier;
  /** Minimum level the student should demonstrate for this requirement. */
  requiredLevel: CapabilityLevel;
}

export interface TargetProfile {
  targetId: string;
  name: string;
  description: string;
  active: boolean;
  requirements: TargetCapabilityRequirement[];
  /** Rough, config-driven prep burden used by the priority shortlist — not a promise. */
  typicalPreparationWeeks?: number;
}

// ---------------------------------------------------------------------------
// Alignment result
// ---------------------------------------------------------------------------

export type AlignmentState =
  | 'STRONGLY_ALIGNED'
  | 'DEVELOPING_ALIGNMENT'
  | 'LOW_ALIGNMENT'
  | 'INSUFFICIENT_EVIDENCE';

export interface AlignmentGap {
  capabilityId: string;
  capabilityName: string;
  importance: ImportanceTier;
  currentLevel: CapabilityLevel;
  requiredLevel: CapabilityLevel;
  /** requiredLevel score minus currentLevel score, floor 0. */
  deficit: number;
  isCritical: boolean;
  confidence: ConfidenceBand;
}

export interface AlignmentStrength {
  capabilityId: string;
  capabilityName: string;
  importance: ImportanceTier;
  level: CapabilityLevel;
}

export interface GapPriority {
  capabilityId: string;
  capabilityName: string;
  /** Gap Impact × Target Importance × Current Weakness × Improvement Potential (spec §27). */
  priorityScore: number;
  rationale: string[];
}

export interface AlignmentResult {
  studentId: string;
  targetId: string;
  targetName: string;
  calculatedAt: string;

  state: AlignmentState;

  /** null when state is INSUFFICIENT_EVIDENCE — never a fabricated number. */
  fitScore: number | null; // 0..100
  readinessScore: number | null; // 0..100
  confidence: ConfidenceBand;

  strengths: AlignmentStrength[];
  criticalGaps: AlignmentGap[];
  supportingGaps: AlignmentGap[];

  nextBestAction: GapPriority | null;

  /** Requirements for which we simply don't have enough evidence to score. */
  insufficientEvidenceCapabilities: string[];
  /** Populated only when state is INSUFFICIENT_EVIDENCE — the trust-mechanism copy from spec §20. */
  insufficientEvidenceReason: string | null;

  explanationFacts: AlignmentExplanationFacts;
}

/**
 * The ONLY payload the AI explanation layer is allowed to see. Keeping this
 * as its own narrow, serializable type is what makes "the AI cannot invent
 * facts" enforceable in code rather than just in a prompt (spec §47-48).
 */
export interface AlignmentExplanationFacts {
  targetName: string;
  state: AlignmentState;
  fitScore: number | null;
  readinessScore: number | null;
  confidence: ConfidenceBand;
  topStrengths: string[]; // capability names only
  criticalGapNames: string[];
  supportingGapNames: string[];
  nextBestActionCapability: string | null;
}

// ---------------------------------------------------------------------------
// Snapshots / history
// ---------------------------------------------------------------------------

export interface AlignmentSnapshot {
  studentId: string;
  targetId: string;
  fitScore: number | null;
  readinessScore: number | null;
  state: AlignmentState;
  capturedAt: string;
}

// ---------------------------------------------------------------------------
// Forecast (Feature 27) — read-only, secondary signal. Spec §8: "Forecast
// != proof." readinessCalculator uses this only as a small modifier, never
// as the primary driver, and treats a missing signal as perfectly neutral.
// ---------------------------------------------------------------------------

export interface ForecastSignal {
  capabilityId: string;
  /** -1..1. Positive = forecast expects continued improvement; negative = regression risk. */
  trend: number;
  /** 0..1 — the forecast engine's own confidence in this trend. Low-confidence forecasts are damped further before they can move readiness. */
  forecastConfidence: number;
}

// ---------------------------------------------------------------------------
// What-if scenarios
// ---------------------------------------------------------------------------

export interface WhatIfInput {
  studentId: string;
  targetId: string;
  capabilityId: string;
  projectedLevel: CapabilityLevel;
}

export interface WhatIfResult {
  studentId: string;
  targetId: string;
  capabilityId: string;
  currentLevel: CapabilityLevel;
  projectedLevel: CapabilityLevel;
  currentFitScore: number | null;
  projectedFitScore: number | null;
  currentReadinessScore: number | null;
  projectedReadinessScore: number | null;
  /** False when confidence is too low to project a trustworthy delta (spec §46). */
  projectionReliable: boolean;
  label: 'PROJECTED'; // rendered constant — never mistaken for ACTUAL
}

// ---------------------------------------------------------------------------
// Target strategy (primary / secondary / stretch) — spec §31
// ---------------------------------------------------------------------------

export type StrategyTier = 'PRIMARY' | 'SECONDARY' | 'STRETCH';

export interface TargetPriorityEntry {
  targetId: string;
  targetName: string;
  rank: number;
  tier: StrategyTier;
  fitScore: number | null;
  readinessScore: number | null;
  state: AlignmentState;
  reason: string;
}

// ---------------------------------------------------------------------------
// Student target selection (drift tracking) — spec §34
// ---------------------------------------------------------------------------

export interface StudentTargetRecord {
  studentId: string;
  targetId: string;
  selectedAt: string;
  previousTargetId: string | null;
  reason: string | null;
}
