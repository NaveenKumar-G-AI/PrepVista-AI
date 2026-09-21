import { Router } from 'express';
import { Engine } from '../services/index.js';
import { assertPermission, assertTenantAccess, filterQuestionVersionForRole } from '../security/rbac.js';
import { ProductionMode, ReportType, ReviewDecision, Role } from '../types/enums.js';
import { asyncHandler } from './middleware.js';

export function buildRoutes(engine: Engine): Router {
  const router = Router();

  // ---- Authoring / validation --------------------------------------------------------------
  router.post(
    '/questions',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'EDIT_QUESTION');
      const result = await engine.qualityService.createAndValidate({ ...req.body, tenantId: req.tenantId }, `user:${req.actorId}`);
      res.status(201).json(result);
    }),
  );

  router.post(
    '/questions/:id/versions/:versionId/validate',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'EDIT_QUESTION');
      const result = await engine.qualityService.validateQuestion(req.params.versionId);
      res.json(result);
    }),
  );

  router.post(
    '/questions/:id/versions',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'EDIT_QUESTION');
      const version = await engine.versioningService.createNewVersion(req.params.id, req.body, `user:${req.actorId}`);
      res.status(201).json(version);
    }),
  );

  router.get(
    '/questions/:id/versions',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'VIEW_PUBLIC_QUESTION');
      const question = engine.repo.getQuestion(req.params.id);
      if (!question) return res.status(404).json({ error: 'NOT_FOUND' });
      assertTenantAccess(req.tenantId, question);
      const versions = engine.repo.listVersions(req.params.id).map((v) => filterQuestionVersionForRole(v, req.role));
      res.json(versions);
    }),
  );

  // ---- Quality / issues / provenance / audit -------------------------------------------------
  router.get(
    '/questions/:id/quality',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'VIEW_QUALITY_SUMMARY');
      const question = engine.repo.getQuestion(req.params.id);
      if (!question || !question.currentVersionId) return res.status(404).json({ error: 'NOT_FOUND' });
      assertTenantAccess(req.tenantId, question);
      res.json(engine.qualityService.getScorecard(question.currentVersionId));
    }),
  );

  router.get(
    '/questions/:id/issues',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'VIEW_ISSUES');
      const question = engine.repo.getQuestion(req.params.id);
      if (!question || !question.currentVersionId) return res.status(404).json({ error: 'NOT_FOUND' });
      assertTenantAccess(req.tenantId, question);
      res.json(engine.repo.listIssues(question.currentVersionId));
    }),
  );

  router.get(
    '/questions/:id/provenance',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'VIEW_QUALITY_SUMMARY');
      const version = engine.repo.getCurrentVersion(req.params.id);
      if (!version) return res.status(404).json({ error: 'NOT_FOUND' });
      const { source, authorId, generator, model, promptVersion, createdAt, createdBy } = version;
      res.json({ source, authorId, generator, model, promptVersion, createdAt, createdBy });
    }),
  );

  router.get(
    '/questions/:id/audit',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'VIEW_AUDIT_TRAIL');
      const question = engine.repo.getQuestion(req.params.id);
      if (!question) return res.status(404).json({ error: 'NOT_FOUND' });
      assertTenantAccess(req.tenantId, question);
      res.json(engine.audit.trail(req.params.id));
    }),
  );

  // ---- Student reporting ---------------------------------------------------------------------
  router.post(
    '/questions/:id/report',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'REPORT_QUESTION');
      const reportType: ReportType = req.body.reportType;
      const record = await engine.reportService.submitReport({
        questionId: req.params.id,
        versionId: req.body.versionId,
        studentId: req.actorId,
        reportType,
        description: req.body.description,
      });
      res.status(201).json(record);
    }),
  );

  // ---- Review workflow ------------------------------------------------------------------------
  router.post(
    '/questions/:id/review',
    asyncHandler(async (req, res) => {
      const decision: ReviewDecision = req.body.decision;
      const question = engine.reviewService.reviewQuestion({
        questionId: req.params.id,
        reviewerId: req.actorId,
        role: req.role,
        decision,
        reason: req.body.reason,
        overrideReason: req.body.overrideReason,
        expectedLifecycleVersion: req.body.expectedLifecycleVersion,
      });
      res.json(question);
    }),
  );

  router.get(
    '/review-queue',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'VIEW_ISSUES');
      const all = engine.repo.listQuestions({ tenantId: req.tenantId, includeGlobal: true });
      const needsReview = all.filter((q) => q.lifecycleStatus === 'NEEDS_REVIEW');
      res.json(
        needsReview.map((q) => ({
          question: q,
          version: engine.repo.getCurrentVersion(q.id),
          issues: engine.repo.getCurrentVersion(q.id) ? engine.repo.listIssues(engine.repo.getCurrentVersion(q.id)!.id) : [],
        })),
      );
    }),
  );

  // ---- Publication / pool eligibility -----------------------------------------------------------
  router.get(
    '/pool/eligible',
    asyncHandler(async (req, res) => {
      assertPermission(req.role, 'PRACTICE_APPROVED_QUESTIONS');
      const mode = (req.query.mode as ProductionMode) ?? ProductionMode.PRACTICE;
      const pool = engine.publicationService.getEligiblePool({ tenantId: req.tenantId, skill: req.query.skill as string, mode });
      res.json(pool.map((v) => filterQuestionVersionForRole(v, req.role)));
    }),
  );

  return router;
}
