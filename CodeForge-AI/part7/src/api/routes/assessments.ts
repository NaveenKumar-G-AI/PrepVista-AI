import { Router, Response } from 'express';
import { withUserContext } from '../../db';
import { AuthedRequest } from '../middleware/auth';
import { createAssessment } from '../../services/assessmentService';
import { startAssessment, getAssessmentWithAutoExpire, cancelAssessment } from '../../services/sessionService';
import { submitCode, requestHint } from '../../services/submissionService';
import { finalizeAssessment } from '../../services/finalizationService';
import { buildStudentReport, buildCohortReport } from '../../services/reportService';
import { listAssessmentsForCurrentUser, getAssessmentChallenges, getSubmissionTestResults } from '../../services/workspaceQueryService';
import { appError } from '../../types';

export const assessmentsRouter = Router();

function asyncRoute(fn: (req: AuthedRequest, res: Response) => Promise<void>) {
  return (req: AuthedRequest, res: Response, next: (e?: unknown) => void) => fn(req, res).catch(next);
}

assessmentsRouter.get(
  '/assessments',
  asyncRoute(async (req, res) => {
    const list = await withUserContext(req.userId!, req.userRole!, (client) => listAssessmentsForCurrentUser(client, req.userId!));
    res.json(list);
  })
);

assessmentsRouter.get(
  '/assessments/:id/challenges',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const challenges = await withUserContext(req.userId!, req.userRole!, (client) => getAssessmentChallenges(client, id));
    res.json(challenges);
  })
);

assessmentsRouter.get(
  '/submissions/:submissionId/results',
  asyncRoute(async (req, res) => {
    const results = await withUserContext(req.userId!, req.userRole!, (client) =>
      getSubmissionTestResults(client, String(req.params.submissionId))
    );
    res.json(results);
  })
);


assessmentsRouter.post(
  '/assessments',
  asyncRoute(async (req, res) => {
    if (req.userRole !== 'student') throw appError('UNAUTHORIZED_ACCESS', 'Only a student can create their own assessment', 403);
    const assessment = await withUserContext(req.userId!, req.userRole, (client) =>
      createAssessment(client, { studentId: req.userId!, ...req.body })
    );
    res.status(201).json(assessment);
  })
);

assessmentsRouter.get(
  '/assessments/:id',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const assessment = await withUserContext(req.userId!, req.userRole!, (client) => getAssessmentWithAutoExpire(client, id));
    res.json(assessment);
  })
);

assessmentsRouter.post(
  '/assessments/:id/start',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const assessment = await withUserContext(req.userId!, req.userRole!, (client) => startAssessment(client, id));
    res.json(assessment);
  })
);

assessmentsRouter.post(
  '/assessments/:id/cancel',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const assessment = await withUserContext(req.userId!, req.userRole!, (client) => cancelAssessment(client, id));
    res.json(assessment);
  })
);

assessmentsRouter.post(
  '/assessments/:id/challenges/:challengeId/hint',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const challengeId = String(req.params.challengeId);
    await withUserContext(req.userId!, req.userRole!, (client) =>
      requestHint(client, id, req.userId!, challengeId, Number(req.body.hint_level ?? 1))
    );
    res.status(204).send();
  })
);

assessmentsRouter.post(
  '/assessments/:id/challenges/:challengeId/submit',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const challengeId = String(req.params.challengeId);
    const { language, code, idempotency_key } = req.body;
    const outcome = await withUserContext(req.userId!, req.userRole!, (client) =>
      submitCode(client, {
        assessmentId: id,
        studentId: req.userId!,
        assessmentChallengeId: challengeId,
        language,
        code,
        idempotencyKey: idempotency_key,
      })
    );

    // If that submission completed the assessment, run the deterministic
    // finalization tail in the SAME transaction context (still scoped to
    // this student for RLS purposes).
    if (outcome.assessmentNowSubmitted) {
      const finalized = await withUserContext(req.userId!, req.userRole!, (client) => finalizeAssessment(client, id));
      res.json({ ...outcome, finalized });
      return;
    }
    res.json(outcome);
  })
);

assessmentsRouter.get(
  '/assessments/:id/report',
  asyncRoute(async (req, res) => {
    const id = String(req.params.id);
    const report = await withUserContext(req.userId!, req.userRole!, (client) => buildStudentReport(client, id));
    res.json(report);
  })
);

assessmentsRouter.get(
  '/cohort-report',
  asyncRoute(async (req, res) => {
    if (req.userRole !== 'tpo' && req.userRole !== 'management') {
      throw appError('UNAUTHORIZED_ACCESS', 'Only TPO/management can view cohort reports', 403);
    }
    const roleId = String(req.query.role_id);
    const report = await withUserContext(req.userId!, req.userRole, (client) => buildCohortReport(client, roleId));
    res.json(report);
  })
);
