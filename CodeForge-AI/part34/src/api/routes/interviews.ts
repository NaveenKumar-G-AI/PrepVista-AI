// ============================================================================
// Phase 64 — API design. Routes are thin: parse -> authorize (delegated to
// the use case) -> call orchestration -> shape the response. No business
// logic lives in this file; every route is a direct call into
// src/orchestration/*.ts.
// ============================================================================

import { Router, type NextFunction, type Request, type Response } from "express";
import {
  asRoleId,
  asSessionId,
  asStudentId,
  type EvaluationId,
  type QuestionId,
} from "../../domain/types.js";
import type { AppContainer } from "../../orchestration/container.js";
import { createInterview } from "../../orchestration/createInterview.js";
import { createGapVerificationInterview } from "../../orchestration/gapVerification.js";
import { cancelSession, getSession, pauseSession, recoverSession, resumeSession, startSession } from "../../orchestration/sessionLifecycle.js";
import { requestNextQuestion } from "../../orchestration/questionFlow.js";
import { submitResponse } from "../../orchestration/submitResponse.js";
import { retryPendingEvaluation } from "../../orchestration/retryEvaluation.js";
import { completeSession } from "../../orchestration/completeSession.js";
import { getInstitutionalReport, getInterviewHistory, getInterviewSummary, getSessionEvaluations, getSessionSkillEvidence } from "../../orchestration/queries.js";
import { cancelSessionSchema, createGapVerificationInterviewSchema, createInterviewSchema, institutionalReportQuerySchema, submitResponseSchema } from "../schemas.js";
import { toPublicQuestion, toPublicSession, toPublicSubmitResult } from "../presenters.js";

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

/** Express 4 does not forward rejected promises to error middleware automatically. */
function asyncHandler(handler: Handler) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res, next).catch(next);
  };
}

export function buildInterviewRouter(container: AppContainer): Router {
  const router = Router();

  // ---- create interview -----------------------------------------------------
  router.post(
    "/interviews",
    asyncHandler(async (req, res) => {
      const body = createInterviewSchema.parse(req.body);
      const result = await createInterview(container, {
        actor: req.actor!,
        orgId: req.orgId!,
        studentId: asStudentId(body.studentId),
        roleId: asRoleId(body.roleId),
        mode: body.mode,
        targetSkillIds: body.targetSkillIds,
      });
      res.status(201).json({ definition: result.definition, session: toPublicSession(result.session, req.actor!) });
    }),
  );

  // ---- create gap-verification interview (Phase 51) --------------------------
  router.post(
    "/interviews/gap-verification",
    asyncHandler(async (req, res) => {
      const body = createGapVerificationInterviewSchema.parse(req.body);
      const result = await createGapVerificationInterview(container, {
        actor: req.actor!,
        orgId: req.orgId!,
        studentId: asStudentId(body.studentId),
        roleId: asRoleId(body.roleId),
        maxSkills: body.maxSkills,
      });
      res.status(201).json({ definition: result.definition, session: toPublicSession(result.session, req.actor!) });
    }),
  );

  // ---- get session ------------------------------------------------------------
  router.get(
    "/interviews/sessions/:sessionId",
    asyncHandler(async (req, res) => {
      const session = await getSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ session: toPublicSession(session, req.actor!) });
    }),
  );

  // ---- start / pause / resume / cancel / complete ------------------------------
  router.post(
    "/interviews/sessions/:sessionId/start",
    asyncHandler(async (req, res) => {
      const session = await startSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ session: toPublicSession(session, req.actor!) });
    }),
  );

  router.post(
    "/interviews/sessions/:sessionId/pause",
    asyncHandler(async (req, res) => {
      const session = await pauseSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ session: toPublicSession(session, req.actor!) });
    }),
  );

  router.post(
    "/interviews/sessions/:sessionId/resume",
    asyncHandler(async (req, res) => {
      const session = await resumeSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ session: toPublicSession(session, req.actor!) });
    }),
  );

  router.post(
    "/interviews/sessions/:sessionId/recover",
    asyncHandler(async (req, res) => {
      const session = await recoverSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ session: toPublicSession(session, req.actor!) });
    }),
  );

  router.post(
    "/interviews/sessions/:sessionId/cancel",
    asyncHandler(async (req, res) => {
      const body = cancelSessionSchema.parse(req.body);
      const session = await cancelSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!), body.reason);
      res.json({ session: toPublicSession(session, req.actor!) });
    }),
  );

  router.post(
    "/interviews/sessions/:sessionId/complete",
    asyncHandler(async (req, res) => {
      const result = await completeSession(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ session: toPublicSession(result.session, req.actor!), summary: result.summary });
    }),
  );

  // ---- question flow -----------------------------------------------------------
  router.get(
    "/interviews/sessions/:sessionId/next-question",
    asyncHandler(async (req, res) => {
      const outcome = await requestNextQuestion(container, req.orgId!, req.actor!, asSessionId(req.params.sessionId!));
      switch (outcome.status) {
        case "QUESTION_READY":
        case "AWAITING_RESPONSE":
          res.json({ status: outcome.status, question: toPublicQuestion(outcome.question), session: toPublicSession(outcome.session, req.actor!) });
          return;
        case "AWAITING_EVALUATION":
          res.status(202).json({ status: outcome.status, questionId: outcome.questionId, session: toPublicSession(outcome.session, req.actor!) });
          return;
        case "READY_TO_COMPLETE":
          res.json({ status: outcome.status, session: toPublicSession(outcome.session, req.actor!) });
          return;
        case "GENERATION_FAILED":
          res.status(503).json({ status: outcome.status, reason: outcome.reason, session: toPublicSession(outcome.session, req.actor!) });
          return;
      }
    }),
  );

  // ---- responses ------------------------------------------------------------------
  router.post(
    "/interviews/sessions/:sessionId/responses",
    asyncHandler(async (req, res) => {
      const body = submitResponseSchema.parse(req.body);
      const result = await submitResponse(container, {
        actor: req.actor!,
        orgId: req.orgId!,
        sessionId: asSessionId(req.params.sessionId!),
        questionId: body.questionId as QuestionId,
        content: body.content,
        modality: body.modality,
        idempotencyKey: body.idempotencyKey,
      });
      res.status(result.wasDuplicate ? 200 : 201).json({
        evaluation: toPublicSubmitResult(result.evaluation, req.actor!),
        session: toPublicSession(result.session, req.actor!),
      });
    }),
  );

  router.post(
    "/interviews/sessions/:sessionId/evaluations/:evaluationId/retry",
    asyncHandler(async (req, res) => {
      const result = await retryPendingEvaluation(container, req.orgId!, asSessionId(req.params.sessionId!), req.params.evaluationId as EvaluationId);
      res.json({ resolved: result.resolved, evaluation: toPublicSubmitResult(result.evaluation, req.actor!), session: toPublicSession(result.session, req.actor!) });
    }),
  );

  // ---- read-only: evaluations, skill evidence, history, institutional ------------
  router.get(
    "/interviews/sessions/:sessionId/evaluations",
    asyncHandler(async (req, res) => {
      const evaluations = await getSessionEvaluations(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ evaluations });
    }),
  );

  router.get(
    "/interviews/sessions/:sessionId/skill-evidence",
    asyncHandler(async (req, res) => {
      const skillEvidence = await getSessionSkillEvidence(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ skillEvidence });
    }),
  );

  router.get(
    "/interviews/sessions/:sessionId/summary",
    asyncHandler(async (req, res) => {
      const summary = await getInterviewSummary(container, req.actor!, req.orgId!, asSessionId(req.params.sessionId!));
      res.json({ summary });
    }),
  );

  router.get(
    "/interviews/students/:studentId/history",
    asyncHandler(async (req, res) => {
      const sessions = await getInterviewHistory(container, req.actor!, req.orgId!, asStudentId(req.params.studentId!));
      res.json({ sessions: sessions.map((s) => toPublicSession(s, req.actor!)) });
    }),
  );

  router.get(
    "/interviews/institutional-report",
    asyncHandler(async (req, res) => {
      const query = institutionalReportQuerySchema.parse(req.query);
      const report = await getInstitutionalReport(
        container,
        req.actor!,
        req.orgId!,
        asRoleId(query.roleId),
        query.studentIds.map((id) => asStudentId(id)),
      );
      res.json({ report });
    }),
  );

  return router;
}
