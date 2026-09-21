// ============================================================================
// Use case: submit response. This is where Phase 36 idempotency and the
// Phase 39 evaluation pipeline meet the session's live coverage state.
//
// Idempotency contract: calling this twice with the same (questionId,
// idempotencyKey) returns the SAME response and evaluation both times and
// updates coverage exactly once — verified in
// tests/unit/idempotency.test.ts.
// ============================================================================

import { randomUUID } from "node:crypto";
import { updateSkillCoverage } from "../engine/coverage.js";
import { evaluateResponse } from "../engine/evaluation/pipeline.js";
import { deriveEvidenceState } from "../engine/evaluation/evidenceState.js";
import {
  asResponseId,
  type ActorContext,
  type Evaluation,
  type InterviewSession,
  type OrgId,
  type Question,
  type QuestionId,
  type Response,
  type ResponseModality,
  type SessionId,
} from "../domain/types.js";
import type { AppContainer } from "./container.js";
import { ConflictError, NotFoundError, logEvent, requireAuthorized } from "./helpers.js";

export interface SubmitResponseInput {
  actor: ActorContext;
  orgId: OrgId;
  sessionId: SessionId;
  questionId: QuestionId;
  content: string;
  modality: ResponseModality;
  /** Client-generated key, stable across retries of the SAME logical submission (Phase 36). */
  idempotencyKey: string;
}

export interface SubmitResponseResult {
  response: Response;
  evaluation: Evaluation;
  session: InterviewSession;
  wasDuplicate: boolean;
}

export async function submitResponse(container: AppContainer, input: SubmitResponseInput): Promise<SubmitResponseResult> {
  const { repositories, ports } = container;
  const session = await repositories.sessions.getById(input.sessionId, input.orgId);
  if (!session) throw new NotFoundError("InterviewSession", input.sessionId);
  await requireAuthorized(ports.authz, input.actor, "INTERVIEW_RESPOND", input.orgId, session.studentId);

  if (session.state !== "IN_PROGRESS") {
    throw new ConflictError(`Session ${input.sessionId} is not IN_PROGRESS (current state: ${session.state}); cannot submit a response.`);
  }
  if (session.currentQuestionId !== input.questionId) {
    throw new ConflictError(
      `Question ${input.questionId} is not the session's current question (current: ${session.currentQuestionId ?? "none"}). Call requestNextQuestion first.`,
    );
  }

  const question = await repositories.questions.getById(input.questionId, input.orgId);
  if (!question) throw new NotFoundError("Question", input.questionId);

  // Phase 36 idempotency covers RETRY safety (same idempotencyKey resolves
  // to the same result) — it does not mean "any number of independent
  // responses may target one question." If a response already exists for
  // this question under a DIFFERENT key, that's a second, distinct answer
  // attempt, which would leave two Response/Evaluation records pointing at
  // one question and make getByQuestionId's result ambiguous downstream.
  // Reject it explicitly rather than silently accepting it.
  const existingForQuestion = await repositories.responses.getByQuestionId(input.questionId, input.orgId);
  if (existingForQuestion && existingForQuestion.idempotencyKey !== input.idempotencyKey) {
    throw new ConflictError(
      `Question ${input.questionId} already has a recorded response. Resubmitting with different content is not supported — wait for the next question, or retry with the original idempotencyKey.`,
    );
  }

  const candidateResponse: Response = {
    id: asResponseId(`resp_${randomUUID()}`),
    sessionId: input.sessionId,
    questionId: input.questionId,
    studentId: session.studentId,
    modality: input.modality,
    content: input.content,
    submittedAt: new Date().toISOString(),
    idempotencyKey: input.idempotencyKey,
  };

  const { response, wasDuplicate } = await repositories.responses.saveIfAbsent(candidateResponse, input.orgId);

  if (wasDuplicate) {
    const existingEvaluation = await repositories.evaluations.getByResponseId(response.id, input.orgId);
    if (!existingEvaluation) {
      // Response was recorded but evaluation never completed (e.g. process
      // crashed mid-pipeline) — safe to re-run evaluation for this same
      // response without creating a second response record.
      const evaluation = await runAndPersistEvaluation(container, session, question, response);
      const updatedSession = await applyEvaluationToCoverage(container, session, evaluation);
      return { response, evaluation, session: updatedSession, wasDuplicate: true };
    }
    return { response, evaluation: existingEvaluation, session, wasDuplicate: true };
  }

  const evaluation = await runAndPersistEvaluation(container, session, question, response);
  const updatedSession = await applyEvaluationToCoverage(container, session, evaluation);

  return { response, evaluation, session: updatedSession, wasDuplicate: false };
}

async function runAndPersistEvaluation(
  container: AppContainer,
  session: InterviewSession,
  question: Question,
  response: Response,
): Promise<Evaluation> {
  const { repositories, ports } = container;
  const definition = await repositories.definitions.getById(session.interviewDefinitionId, session.orgId);
  if (!definition) throw new NotFoundError("InterviewDefinition", session.interviewDefinitionId);

  const studentEvidence = await ports.studentEvidence.getStudentEvidenceContext(session.studentId, session.roleId, session.orgId);
  const coverageEntry = session.coverage[question.skillId];

  const startedAt = Date.now();
  const evaluation = await evaluateResponse(
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
  const latencyMs = Date.now() - startedAt;

  await repositories.evaluations.save(evaluation, session.orgId);
  await logEvent(
    repositories.events,
    ports.observability,
    session.orgId,
    session.id,
    "response.evaluated",
    { questionId: question.id, skillId: question.skillId, status: evaluation.status, latencyMs },
    "response.processed",
  );
  if (evaluation.status !== "OK") {
    await logEvent(
      repositories.events,
      ports.observability,
      session.orgId,
      session.id,
      "evaluation.pending",
      { questionId: question.id, failureReason: evaluation.failureReason },
      "evaluation.failed",
    );
  } else {
    ports.observability.track("evaluation.latency", { sessionId: session.id, orgId: session.orgId, latencyMs, skillId: question.skillId });
  }

  return evaluation;
}

async function applyEvaluationToCoverage(container: AppContainer, session: InterviewSession, evaluation: Evaluation): Promise<InterviewSession> {
  if (evaluation.status !== "OK") {
    // Phase 42: an AI/evaluation failure must never look like a bad skill
    // result — coverage is left exactly as it was, so nothing downstream
    // (question selection, completion check) treats "we couldn't evaluate
    // this" as "the student got it wrong."
    return session;
  }

  const { repositories } = container;
  const definition = await repositories.definitions.getById(session.interviewDefinitionId, session.orgId);
  if (!definition) throw new NotFoundError("InterviewDefinition", session.interviewDefinitionId);

  const target = definition.blueprint.skills.find((s) => s.skillId === evaluation.skillId);
  if (!target) return session; // shouldn't happen — defensive only

  const previousEntry = session.coverage[evaluation.skillId];
  const evidenceState = deriveEvidenceState(evaluation.confidence, evaluation.adaptiveSignal);

  const nextEntry = updateSkillCoverage(target, previousEntry, 0, 0, evidenceState, evaluation.confidence);
  const nextSession: InterviewSession = { ...session, coverage: { ...session.coverage, [evaluation.skillId]: nextEntry } };

  const written = await repositories.sessions.updateWithExpectedState(nextSession, session.state);
  if (!written) throw new ConflictError(`Session ${session.id} was modified concurrently while recording evaluation; retry the request.`);
  return nextSession;
}
