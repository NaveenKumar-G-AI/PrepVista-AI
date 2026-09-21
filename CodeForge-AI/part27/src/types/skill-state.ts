/**
 * Longitudinal skill state — section 11-13 of the source spec.
 *
 * A SkillState row is a *snapshot*, never a mutable "current value". The
 * repository layer only ever appends new snapshots (see
 * src/repository/growth-repository.ts); "current state" is defined as the
 * most recent snapshot for a (student, skill) pair. This is what makes
 * historical immutability (section 51) true by construction rather than by
 * policy.
 */

export type SkillStateLabel =
  | 'UNKNOWN'
  | 'INTRODUCED'
  | 'DEVELOPING'
  | 'PRACTICED'
  | 'PROFICIENT'
  | 'MASTERED'
  | 'AT_RISK'
  | 'REGRESSING'
  | 'RECOVERING'
  | 'UNCERTAIN';

export type ConfidenceLevel = 'LOW' | 'MODERATE' | 'HIGH';

export type TrajectoryLabel =
  | 'RAPIDLY_IMPROVING'
  | 'IMPROVING'
  | 'STABLE'
  | 'SLOWING'
  | 'DECLINING'
  | 'RECOVERING'
  | 'INSUFFICIENT_EVIDENCE';

export type RetentionState =
  | 'RETAINED'
  | 'AT_RISK'
  | 'LOST_CONFIDENCE'
  | 'REQUIRES_REINFORCEMENT'
  | 'UNKNOWN';

export type TransferState = 'UNKNOWN' | 'WEAK' | 'MODERATE' | 'STRONG';

export type RegressionSeverity = 'MINOR' | 'MODERATE' | 'SIGNIFICANT' | 'CRITICAL';

export interface ConfidenceResult {
  level: ConfidenceLevel;
  /** 0..1 raw score the level is derived from — kept for explainability, never shown to students as a fake-precise number. */
  score: number;
  evidenceCount: number;
  distinctSources: number;
}

/**
 * The full, evidence-derived state of one skill for one student at one
 * point in time. Every field must be reconstructible from the evidence
 * referenced in `evidenceRefs` — nothing here is ever hand-set.
 */
export interface SkillState {
  skillId: string;
  studentId: string;
  state: SkillStateLabel;
  /** Raw 0..1 weighted-aggregate performance score this state was derived from — kept for trajectory/regression baselines and bottleneck comparisons. Never shown to students as a fake-precise percentage (section 16). */
  performanceScore: number | null;
  confidence: ConfidenceResult;
  trajectory: TrajectoryLabel;
  retention: RetentionState;
  transfer: TransferState;
  regressionSeverity: RegressionSeverity | null;
  firstDemonstrated: string | null;
  lastDemonstrated: string | null;
  lastStrongEvidence: string | null;
  /** Evidence IDs this snapshot was computed from — the reconstructibility contract from section 5. */
  evidenceRefs: string[];
  evidenceCount: number;
  growthModelVersion: string;
  rulesVersion: string;
  computedAt: string; // ISO 8601 — when this snapshot was produced, not when the student acted
}

/** A named point-in-time export of a student's whole skill map — section 14. */
export interface GrowthSnapshot {
  snapshotId: string;
  studentId: string;
  timestamp: string;
  skillModelVersion: string;
  evidenceModelVersion: string;
  growthModelVersion: string;
  skills: SkillState[];
  roleContext?: string;
  /** What triggered this snapshot to be written — an event id, or "periodic". */
  sourceEvent: string;
}
