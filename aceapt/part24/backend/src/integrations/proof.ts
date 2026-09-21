import { ConfidenceLevel, MemoryStateName, RetentionAssessment } from '../types';

/**
 * Contract Feature 24 (Recall) exposes to Feature 23 (Proof), per spec
 * section 42. Feature 24 reports retention + confidence; Feature 23 alone
 * decides whether that's enough to raise long-term readiness confidence.
 * Feature 24 deliberately never certifies readiness itself.
 */
export interface ProofRetentionEvidence {
  studentId: string;
  skillId: string;
  retention: MemoryStateName;
  confidence: ConfidenceLevel;
  lastVerifiedAt: string | null;
  recurringWeakness: boolean;
}

export function buildProofEvidence(a: RetentionAssessment): ProofRetentionEvidence {
  return {
    studentId: a.studentId,
    skillId: a.skillId,
    retention: a.memoryState,
    confidence: a.confidence,
    lastVerifiedAt: a.lastEvidenceAt,
    recurringWeakness: a.recurringWeakness,
  };
}
