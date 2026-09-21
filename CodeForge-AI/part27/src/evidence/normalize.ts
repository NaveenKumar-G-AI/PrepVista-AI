import type { RawEvidenceInput, SkillEvidence } from '../types/evidence.js';
import { EVIDENCE_MODEL_VERSION, growthRules } from '../config/growth-rules.js';
import { generateId } from '../observability/ids.js';

/**
 * Raw Evidence -> Validation -> Normalization -> Skill Mapping -> Evidence
 * Weight -> Confidence (section 7). validate.ts owns the first step; this
 * file owns the rest, turning a RawEvidenceInput into the fully-weighted
 * SkillEvidence record that gets appended to the ledger.
 *
 * Normalization never changes what happened (outcome, strength) — it only
 * derives *how much to trust it* (confidence), which is a function of
 * evidence quality alone, not of whether the outcome was good or bad. A
 * DETERMINISTIC failure is exactly as trustworthy as a DETERMINISTIC pass.
 */

export function deriveEvidenceConfidence(evidenceType: RawEvidenceInput['evidenceType']): number {
  return growthRules.confidence.weight[evidenceType] ?? growthRules.confidence.weight.SELF_REPORTED;
}

export function normalizeEvidence(input: RawEvidenceInput, idGenerator: () => string = generateId): SkillEvidence {
  return {
    evidenceId: idGenerator(),
    studentId: input.studentId,
    source: input.source,
    sourceRecordId: input.sourceRecordId,
    skillId: input.skillId,
    evidenceType: input.evidenceType,
    outcome: input.outcome,
    strength: input.strength,
    confidence: deriveEvidenceConfidence(input.evidenceType),
    timestamp: input.timestamp,
    challengeContext: input.challengeContext,
    roleContext: input.roleContext,
    transferContext: input.transferContext,
    metadata: input.metadata,
    evidenceModelVersion: EVIDENCE_MODEL_VERSION,
  };
}

/**
 * Idempotency key used by the repository's unique constraint (section 57).
 * Re-ingesting the same upstream event should hit this key and be a no-op,
 * not a duplicate.
 */
export function evidenceIdempotencyKey(input: Pick<RawEvidenceInput, 'source' | 'sourceRecordId' | 'skillId'>): string {
  return `${input.source}:${input.sourceRecordId}:${input.skillId}`;
}
