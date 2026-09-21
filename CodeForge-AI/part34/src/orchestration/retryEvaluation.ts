// ============================================================================
// Phase 66 — "Use the existing queue/worker architecture for expensive
// operations such as... AI evaluation... Do not block requests
// unnecessarily."
// Phase 75 — "evaluation timeout" is an explicit failure-recovery scenario.
//
// This file is intentionally NOT a queue implementation — Phase 79 forbids
// building a second one. It's the plain async function your existing
// queue/worker should call on a retry schedule (e.g. "retry
// EVALUATION_PENDING rows older than 30s, up to N attempts") for any
// evaluation that came back pending. The retry POLICY (backoff, attempt
// caps, dead-lettering) belongs to that existing queue infrastructure, not
// here.
// ============================================================================

import { evaluateResponse } from "../engine/evaluation/pipeline.js";
import { updateSkillCoverage } from "../engine/coverage.js";
import { deriveEvidenceState } from "../engine/evaluation/evidenceState.js";
import type { Evaluation, InterviewSession, OrgId, SessionId } from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { ConflictError, NotFoundError, logEvent } from "./helpers.js";

export interface RetryEvaluationResult {
  evaluation: Evaluation;
  resolved: boolean; // true if this retry moved the evaluation from PENDING to OK
  session: InterviewSession;
}

/**
 * Re-runs the evaluation pipeline for one already-persisted evaluation that
 * is still EVALUATION_PENDING. Safe to call multiple times: it always
 * re-evaluates the SAME response, and only touches coverage if the retry
 * actually resolves to OK.
 */
export async function retryPendingEvaluation(
  container: AppContainer,
  orgId: OrgId,
  sessionId: SessionId,
  evaluationId: Evaluation["id"],
): Promise<RetryEvaluationResult> {
  const { repositories, ports } = container;

  const session = await repositories.sessions.getById(sessionId, orgId);
  if (!session) throw new NotFoundError("InterviewSession", sessionId);

  const existing = await repositories.evaluations.getById(evaluationId, orgId);
  if (!existing) throw new NotFoundError("Evaluation", evaluationId);
  if (existing.status === "OK") {
    return { evaluation: existing, resolved: false, session }; // already resolved — nothing to do
  }

  const question = await repositories.questions.getById(existing.questionId, orgId);
  if (!question) throw new NotFoundError("Question", existing.questionId);
  const response = await repositories.responses.getByQuestionId(existing.questionId, orgId);
  if (!response) throw new NotFoundError("Response", existing.questionId);

  const definition = await repositories.definitions.getById(session.interviewDefinitionId, orgId);
  if (!definition) throw new NotFoundError("InterviewDefinition", session.interviewDefinitionId);

  const studentEvidence = await ports.studentEvidence.getStudentEvidenceContext(session.studentId, session.roleId, orgId);
  const coverageEntry = session.coverage[question.skillId];

  const reEvaluated = await evaluateResponse(
    { aiGateway: ports.aiGateway, reasoningVerification: ports.reasoningVerification, understandingCheck: ports.understandingCheck },
    {
      question,
      response,
      roleId: session.roleId,
      studentEvidence,
      evaluationConfig: definition.blueprint.evaluationConfig,
      priorQuestionCountForSkill: coverageEntry?.questionsAsked ?? 1,
      priorEvidenceConfidence: studentEvidence.perSkill[question.skillId]?.confidence ?? 0,
      followUpDepthForSkill: coverageEntry?.followUpDepth ?? 0,
      maxFollowUpDepth: definition.blueprint.followUpConfig.maxFollowUpDepthPerSkill,
    },
  );

  // Preserve the original evaluation id so callers/history keep one stable
  // reference for this response's evaluation across retries.
  const persisted: Evaluation = { ...reEvaluated, id: existing.id };
  await repositories.evaluations.save(persisted, orgId);

  await logEvent(
    repositories.events,
    ports.observability,
    orgId,
    sessionId,
    "evaluation.retry",
    { evaluationId, previousStatus: existing.status, newStatus: persisted.status },
    persisted.status === "OK" ? "response.processed" : "evaluation.failed",
  );

  if (persisted.status !== "OK") {
    return { evaluation: persisted, resolved: false, session };
  }

  const target = definition.blueprint.skills.find((s) => s.skillId === persisted.skillId);
  let updatedSession = session;
  if (target) {
    const evidenceState = deriveEvidenceState(persisted.confidence, persisted.adaptiveSignal);
    const nextEntry = updateSkillCoverage(target, coverageEntry, 0, 0, evidenceState, persisted.confidence);
    const nextSession: InterviewSession = { ...session, coverage: { ...session.coverage, [persisted.skillId]: nextEntry } };
    const written = await repositories.sessions.updateWithExpectedState(nextSession, session.state);
    if (!written) throw new ConflictError(`Session ${sessionId} was modified concurrently during evaluation retry; retry the request.`);
    updatedSession = nextSession;
  }

  return { evaluation: persisted, resolved: true, session: updatedSession };
}
