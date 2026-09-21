/**
 * Feature 37 — Career Readiness Proof Engine
 * Core domain vocabulary.
 *
 * These types are deliberately framework-free (no Prisma, no Express) so the
 * engine that consumes them can be unit tested with plain objects and reused
 * regardless of what database or web framework sits around it.
 */

// ---------------------------------------------------------------------------
// Required level (what a role/opportunity demands of a capability)
// ---------------------------------------------------------------------------

export type RequiredLevel = 'BASIC' | 'INTERMEDIATE' | 'STRONG';

export const REQUIRED_LEVEL_ORDER: RequiredLevel[] = ['BASIC', 'INTERMEDIATE', 'STRONG'];

export function requiredLevelRank(level: RequiredLevel): number {
  return REQUIRED_LEVEL_ORDER.indexOf(level);
}

// ---------------------------------------------------------------------------
// Evidence sources — where a claim about a capability could come from
// ---------------------------------------------------------------------------

export type EvidenceSourceType =
  | 'SELF_REPORT'
  | 'TRAINING'
  | 'CERTIFICATE'
  | 'ASSESSMENT'
  | 'CODING_TEST'
  | 'PROJECT'
  | 'SIMULATION'
  | 'MOCK_INTERVIEW'
  | 'INTERVIEW'
  | 'RESUME'
  | 'PORTFOLIO'
  | 'OPPORTUNITY_OUTCOME';

export type EvidenceOutcome = 'PASSED' | 'FAILED' | 'STRONG' | 'WEAK' | 'COMPLETED' | null;

export type ValidationState = 'UNVALIDATED' | 'SELF_ASSERTED' | 'VALIDATED' | 'DISPUTED';

/**
 * A single, atomic piece of evidence about a student's capability.
 * This is the only thing the engine is ever allowed to reason from —
 * it never invents evidence that isn't represented here.
 */
export interface EvidenceItem {
  id: string;
  studentId: string;
  capabilityId: string;
  sourceType: EvidenceSourceType;
  /** ISO-8601 date the evidence occurred (not when it was recorded). */
  occurredAt: string;
  /** Normalized 0-100 performance score, when the source produces one (assessment %, simulation score). */
  score: number | null;
  /** Qualitative outcome for sources that don't produce a numeric score. */
  outcome: EvidenceOutcome;
  /** Free-text context, e.g. "Built inventory API for capstone project". */
  context: string | null;
  validationState: ValidationState;
  /** Only meaningful on SELF_REPORT items: the level the student claims for themselves. */
  claimedLevel?: RequiredLevel | null;
  /** Id of the record in the originating system (assessment id, project id, etc.), for traceability. */
  externalRefId?: string | null;
}

// ---------------------------------------------------------------------------
// Evidence classification — the ladder from claim to real-world proof
// ---------------------------------------------------------------------------

export type EvidenceClass =
  | 'SELF_REPORTED'
  | 'ACTIVITY'
  | 'KNOWLEDGE'
  | 'PRACTICE'
  | 'DEMONSTRATED'
  | 'VALIDATED'
  | 'REAL_WORLD';

export const EVIDENCE_CLASS_ORDER: EvidenceClass[] = [
  'SELF_REPORTED',
  'ACTIVITY',
  'KNOWLEDGE',
  'PRACTICE',
  'DEMONSTRATED',
  'VALIDATED',
  'REAL_WORLD',
];

export function evidenceClassRank(cls: EvidenceClass): number {
  return EVIDENCE_CLASS_ORDER.indexOf(cls);
}

/** The only label ever shown to a student for a capability. Never a raw percentage. */
export type CapabilityEvidenceLabel = 'UNKNOWN' | 'LIMITED' | 'DEVELOPING' | 'STRONG';

export function labelToLevelRank(label: CapabilityEvidenceLabel): number {
  switch (label) {
    case 'UNKNOWN':
      return -1;
    case 'LIMITED':
      return 0;
    case 'DEVELOPING':
      return 1;
    case 'STRONG':
      return 2;
  }
}

export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type FreshnessState = 'RECENT' | 'AGING' | 'STALE' | 'REVALIDATION_RECOMMENDED';

// ---------------------------------------------------------------------------
// Requirements — what a role or opportunity expects
// ---------------------------------------------------------------------------

/**
 * Importance is a 1-3 scale:
 *  3 = core / must-have for the role
 *  2 = secondary / expected
 *  1 = nice-to-have
 */
export type CapabilityImportance = 1 | 2 | 3;

export interface CapabilityRequirement {
  capabilityId: string;
  capabilityName: string;
  requiredLevel: RequiredLevel;
  importance: CapabilityImportance;
}

// ---------------------------------------------------------------------------
// Aggregated per-capability evidence result
// ---------------------------------------------------------------------------

export interface CapabilityEvidenceResult {
  capabilityId: string;
  label: CapabilityEvidenceLabel;
  /** null only when there is genuinely no evidence at all. */
  achievedClass: EvidenceClass | null;
  confidence: ConfidenceLevel;
  independentSourceCount: number;
  freshestEvidenceDate: string | null;
  freshnessState: FreshnessState | null;
  hasConflict: boolean;
  conflictExplanation: string | null;
  contributingEvidenceIds: string[];
  /** Human-readable "why" bullets, deterministically generated — never invented. */
  reasons: string[];
}

export interface CapabilityStatus extends CapabilityEvidenceResult {
  capabilityName: string;
  requiredLevel: RequiredLevel;
  importance: CapabilityImportance;
  meetsRequirement: boolean;
}

// ---------------------------------------------------------------------------
// Readiness (role or opportunity level)
// ---------------------------------------------------------------------------

export type ReadinessState =
  | 'UNKNOWN'
  | 'EXPLORING'
  | 'BUILDING'
  | 'DEVELOPING'
  | 'VALIDATING'
  | 'READY_TO_TEST'
  | 'STRONG_EVIDENCE';

export const READINESS_STATE_ORDER: ReadinessState[] = [
  'UNKNOWN',
  'EXPLORING',
  'BUILDING',
  'DEVELOPING',
  'VALIDATING',
  'READY_TO_TEST',
  'STRONG_EVIDENCE',
];

export interface ReadinessGap {
  capabilityId: string;
  capabilityName: string;
  requiredLevel: RequiredLevel;
  currentLabel: CapabilityEvidenceLabel;
  importance: CapabilityImportance;
  /** How many levels below the requirement the current evidence sits. Always >= 1 for a gap. */
  distance: number;
}

export interface ReadinessResult {
  state: ReadinessState;
  confidence: ConfidenceLevel;
  capabilityStatuses: CapabilityStatus[];
  gaps: ReadinessGap[];
  topGap: ReadinessGap | null;
  reasons: string[];
}

// ---------------------------------------------------------------------------
// Claim vs proof
// ---------------------------------------------------------------------------

export type ClaimComparisonStatus = 'ALIGNED' | 'OVERCLAIM' | 'UNDERCLAIM' | 'NO_CLAIM';

export interface ClaimComparisonResult {
  status: ClaimComparisonStatus;
  message: string;
}

// ---------------------------------------------------------------------------
// Next-proof recommendation
// ---------------------------------------------------------------------------

export type ValidationType = 'SIMULATION' | 'CODING_TEST' | 'PROJECT' | 'MOCK_INTERVIEW';

export interface ValidationCatalogEntry {
  capabilityId: string;
  validationType: ValidationType;
  title: string;
  description: string;
  ctaLabel: string;
  /** Opaque id/route the client app uses to actually launch this validation (Feature 36's territory). */
  actionRef?: string;
}

export interface NextProofRecommendation {
  capabilityId: string;
  capabilityName: string;
  headline: string;
  description: string;
  ctaLabel: string;
  actionRef?: string;
}
