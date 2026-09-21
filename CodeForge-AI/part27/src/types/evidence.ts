/**
 * Evidence types — the atomic, append-only unit the entire growth engine is
 * built on. See section 6-9 of the source spec ("Evidence Over Opinion").
 *
 * Nothing downstream (skill state, trajectory, milestones, events) is ever
 * allowed to exist without at least one SkillEvidence record backing it.
 */

export type EvidenceSource =
  | 'correctness'
  | 'complexity'
  | 'code_quality'
  | 'reasoning'
  | 'consistency'
  | 'understanding'
  | 'debugging'
  | 'adaptive_learning'
  | 'review';

/**
 * How much weight a piece of evidence deserves. Deterministic, machine-
 * verified outcomes (a test suite passing) always outrank inferred or
 * self-reported claims — see growthRules.confidence.weight for the actual
 * numeric weighting.
 */
export type EvidenceQuality =
  | 'DIRECT'
  | 'INDIRECT'
  | 'DETERMINISTIC'
  | 'INFERRED'
  | 'SELF_REPORTED'
  | 'AI_ASSISTED';

export type EvidenceOutcome = 'positive' | 'negative' | 'neutral';

export interface TransferContext {
  /** True if this evidence comes from applying a skill outside the context it was first learned in. */
  isTransferAttempt: boolean;
  /** Free-text label for the context the skill was originally learned in, e.g. "hash-maps-in-arrays". */
  baseContext?: string;
  /** Free-text label for the novel context being tested, e.g. "hash-maps-in-streaming-data". */
  novelContext?: string;
}

/**
 * A single, immutable unit of evidence about a student's demonstrated
 * capability on one skill. Rows of this shape are INSERT-only — see
 * db/migrations/0001_growth_schema.sql (unique constraint on
 * (source, source_record_id, skill_id) makes re-ingestion idempotent
 * rather than duplicative — section 57).
 */
export interface SkillEvidence {
  evidenceId: string;
  studentId: string;
  source: EvidenceSource;
  /** ID of the authoritative record in the owning system (submission id, review id, ...). Never fabricated. */
  sourceRecordId: string;
  skillId: string;
  evidenceType: EvidenceQuality;
  outcome: EvidenceOutcome;
  /** 0..1 — how strong a signal this single record is (e.g. a full pass vs. a partial pass). */
  strength: number;
  /** 0..1 — how much this record should be trusted, independent of its outcome. Derived, not asserted by the caller. */
  confidence: number;
  timestamp: string; // ISO 8601
  challengeContext?: Record<string, unknown>;
  roleContext?: string;
  transferContext?: TransferContext;
  metadata?: Record<string, unknown>;
  /** Version of the normalization rules that produced this record — see growthRules.version. */
  evidenceModelVersion: string;
}

/** Shape evidence arrives in from upstream systems, before normalization/validation. */
export interface RawEvidenceInput {
  studentId: string;
  source: EvidenceSource;
  sourceRecordId: string;
  skillId: string;
  evidenceType: EvidenceQuality;
  outcome: EvidenceOutcome;
  strength: number;
  timestamp: string;
  challengeContext?: Record<string, unknown>;
  roleContext?: string;
  transferContext?: TransferContext;
  metadata?: Record<string, unknown>;
}
