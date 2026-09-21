import * as discoveryRepo from '../repositories/discoveryRepository';
import * as analytics from '../repositories/analyticsRepository';
import type { StrategyType } from '../domain/enums';
import type { AIClient } from '../integrations/aiClient';

export const DISCOVERY_MIN_EVIDENCE_FOR_READY = 5;
export const DISCOVERY_MIN_CONFIDENCE_FOR_READY = 0.7;

export interface DiscoveryEvidenceInput {
  tenantId: string;
  studentId: string;
  candidateStrategyType: StrategyType;
  questionFamilyId: string | null;
  methodSignature: string;
  success: boolean;
  questionId?: string;
}

/**
 * Behavioural pattern capture (secs. 71-75). This is a v1 heuristic, not a
 * real mining pipeline: a caller (the practice/attempt pipeline, in a full
 * integration) tells us "this student solved this family with a method
 * that doesn't match any known shortcut, described as X" every time it
 * happens, and we accumulate evidence per unique (student, family, method)
 * combination (sec. 275, dedup) until it's substantial enough to prompt a
 * "test this?" moment (sec. 73) - never enough to auto-trust it (sec. 76).
 * See README "Known limitations" for what a real pattern-mining
 * implementation would add.
 */
export function recordDiscoveryEvidence(input: DiscoveryEvidenceInput): discoveryRepo.DiscoveryRow {
  const existing = discoveryRepo.findDiscovery(input.studentId, input.questionFamilyId, input.methodSignature);

  if (!existing) {
    const evidence = { count: 1, successCount: input.success ? 1 : 0, questionIds: input.questionId ? [input.questionId] : [] };
    const confidence = computeConfidence(evidence.count, evidence.successCount);
    const row = discoveryRepo.insertDiscovery({
      tenantId: input.tenantId,
      studentId: input.studentId,
      candidateStrategyType: input.candidateStrategyType,
      questionFamilyId: input.questionFamilyId,
      methodSignature: input.methodSignature,
      evidence,
      confidence,
      status: statusFor(evidence.count, confidence),
    });
    analytics.logEvent({ tenantId: input.tenantId, studentId: input.studentId, eventType: 'shortcut_discovered', payload: { discoveryId: row.id } });
    return row;
  }

  const prevEvidence = JSON.parse(existing.evidence) as { count: number; successCount: number; questionIds: string[] };
  const evidence = {
    count: prevEvidence.count + 1,
    successCount: prevEvidence.successCount + (input.success ? 1 : 0),
    questionIds: input.questionId ? [...prevEvidence.questionIds, input.questionId].slice(-20) : prevEvidence.questionIds,
  };
  const confidence = computeConfidence(evidence.count, evidence.successCount);
  discoveryRepo.updateDiscoveryEvidence(existing.id, evidence, confidence, statusFor(evidence.count, confidence));
  return { ...existing, evidence: JSON.stringify(evidence), confidence, status: statusFor(evidence.count, confidence) };
}

function computeConfidence(count: number, successCount: number): number {
  const successRate = count > 0 ? successCount / count : 0;
  const evidenceWeight = Math.min(1, count / DISCOVERY_MIN_EVIDENCE_FOR_READY);
  return Number((successRate * evidenceWeight).toFixed(3));
}

function statusFor(count: number, confidence: number): discoveryRepo.DiscoveryRow['status'] {
  if (count >= DISCOVERY_MIN_EVIDENCE_FOR_READY && confidence >= DISCOVERY_MIN_CONFIDENCE_FOR_READY) return 'CANDIDATE_READY';
  return 'CANDIDATE_ACCUMULATING';
}

export function listDiscoveries(studentId: string) {
  return discoveryRepo.listDiscoveriesForStudent(studentId);
}

export function dismissDiscovery(id: string): void {
  discoveryRepo.markDiscoveryReviewed(id, 'DISMISSED');
}

/**
 * Optional AI-assisted explanation draft for a ready candidate (secs. 76-80).
 * Always EXPERIMENTAL, never auto-applied: the return value is meant for a
 * human (content reviewer, or the student themselves) to read and edit, not
 * to be written straight into a shortcut's underlying_reason.
 */
export async function draftExplanation(ai: AIClient, discovery: discoveryRepo.DiscoveryRow): Promise<string | null> {
  if (!ai.enabled) return null;
  return ai.draftCandidateExplanation({
    methodSignature: discovery.method_signature,
    questionFamilyId: discovery.question_family_id,
  });
}
