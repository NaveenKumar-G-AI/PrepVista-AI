// Section 22 — failure signature: classify the observable failure pattern
// from actual evidence only. Section 35 — PROOF classifies and forwards;
// Feature 26 (Adapt) owns intervention logic and is not duplicated here.

import type {
  VerificationFactor, FailureSignature, VerificationEvidence, RecoveryPattern, TimeSegmentPerformance,
} from './types.js';
import type { AdaptInterventionRequest } from './ports.js';

export interface DetermineFailureSignatureInput {
  factors: VerificationFactor[];
  evidence: VerificationEvidence[];
  timeSegments?: TimeSegmentPerformance[];
  recovery?: RecoveryPattern;
  lateTestDegradation?: boolean;
}

export function determineFailureSignatures(input: DetermineFailureSignatureInput): FailureSignature[] {
  const signatures: FailureSignature[] = [];
  const failed = new Map(input.factors.filter((f) => !f.meetsRequirement).map((f) => [f.name, f]));

  const evidenceIdsFor = () => input.evidence.slice(0, 5).map((e) => e.id);

  const target = failed.get('Target Capability');
  if (target) {
    signatures.push({ type: 'KNOWLEDGE_GAP', evidenceRefs: evidenceIdsFor(), explanation: target.explanation });
  }

  const novel = failed.get('Novel Performance');
  if (novel) {
    signatures.push({ type: 'NOVELTY_HANDLING', evidenceRefs: evidenceIdsFor(), explanation: novel.explanation });
  }

  // A stronger, more specific read of the same signal: familiar-item
  // performance is solid but hasn't carried over to novel items.
  const practice = input.factors.find((f) => f.name === 'Target Capability');
  if (novel && practice?.meetsRequirement) {
    signatures.push({
      type: 'TRANSFER_GAP',
      evidenceRefs: evidenceIdsFor(),
      explanation: 'Strong performance on familiar items has not yet carried over to novel ones.',
    });
  }

  const timed = failed.get('Timed Performance');
  if (timed) {
    signatures.push({ type: 'SPEED_GAP', evidenceRefs: evidenceIdsFor(), explanation: timed.explanation });
  }

  const consistency = failed.get('Consistency');
  if (consistency) {
    signatures.push({ type: 'CONSISTENCY', evidenceRefs: evidenceIdsFor(), explanation: consistency.explanation });
  }

  if (input.lateTestDegradation) {
    signatures.push({
      type: 'LATE_TEST_DEGRADATION',
      evidenceRefs: [],
      explanation: 'Accuracy in the final stretch of the most recent simulation was measurably lower than the opening stretch.',
    });
  }

  if (input.recovery?.longStallFollowedByInaccuracy) {
    signatures.push({
      type: 'TIME_MANAGEMENT',
      evidenceRefs: [],
      explanation: 'A long stall on a difficult question was followed by lower accuracy on the questions right after it.',
    });
  }

  return signatures;
}

export function buildAdaptPayload(
  studentId: string,
  targetId: string,
  resultId: string,
  signatures: FailureSignature[],
): AdaptInterventionRequest {
  return {
    studentId,
    targetId,
    resultId,
    failureSignatures: signatures.map((s) => ({ type: s.type, explanation: s.explanation })),
  };
}
