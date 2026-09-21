import { Router } from 'express';
import { z } from 'zod';
import { auth } from '../middleware/auth';
import { authorize } from '../middleware/authorize';
import { asyncHandler } from '../utils/asyncHandler';
import { ValidationError } from '../utils/errors';
import { Role, CohortKind, CohortDimension, IntelligenceEventType } from '../domain/enums';
import { cohortService } from '../services/cohort.service';
import { aggregationService } from '../services/aggregation.service';
import {
  getCohortExecutiveOverviewWithNarrative,
  getTpoDashboard,
  getTrainerDashboard,
  getAdminDashboard,
} from '../services/dashboard.service';
import { compareCohorts } from '../services/comparison.service';
import { captureSnapshot, listSnapshots } from '../services/snapshot.service';
import { exportCohortReport } from '../services/export.service';
import { recordAudit } from '../services/audit.service';
import { ingestIntelligenceEvent } from '../events/handlers';
import { repositories } from '../repositories';
import { cache, buildTenantCacheKey } from '../cache';

const router = Router();

const ADMIN_ROLES = [Role.ORG_ADMIN, Role.DEPARTMENT_ADMIN];
const READ_ROLES = [Role.ORG_ADMIN, Role.DEPARTMENT_ADMIN, Role.TPO, Role.TRAINER];

router.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

router.use(auth);

// ── Cohort management (sections 6-8, 52) ──────────────────────────────

const createCohortSchema = z.object({
  name: z.string().min(1),
  kind: z.nativeEnum(CohortKind),
  dimension: z.nativeEnum(CohortDimension),
  parentCohortId: z.string().optional(),
  attributes: z.record(z.unknown()).optional(),
});

router.post(
  '/cohorts',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = createCohortSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid cohort payload.', parsed.error.flatten());
    // organizationId always comes from the authenticated token, never
    // from the request body (section 52) — a client cannot create a
    // cohort in someone else's institution by supplying a different id.
    const cohort = await cohortService.create({ organizationId: req.auth!.organizationId, ...parsed.data });
    await recordAudit(req.auth!, 'COHORT_CREATED', { type: 'cohort', id: cohort.id });
    res.status(201).json(cohort);
  })
);

router.get(
  '/cohorts',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const kind = req.query.kind as CohortKind | undefined;
    const cohorts = await cohortService.list(req.auth!.organizationId, kind);
    res.json({ cohorts });
  })
);

router.get(
  '/cohorts/:cohortId',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const cohort = await cohortService.get(req.auth!.organizationId, req.params.cohortId as string);
    res.json(cohort);
  })
);

const addMemberSchema = z.object({ studentId: z.string().min(1) });

router.post(
  '/cohorts/:cohortId/members',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = addMemberSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid membership payload.', parsed.error.flatten());
    const cohortId = req.params.cohortId as string;
    const membership = await cohortService.addMember(req.auth!.organizationId, cohortId, parsed.data.studentId);
    await recordAudit(req.auth!, 'MEMBERSHIP_CHANGED', { type: 'cohort', id: cohortId }, { studentId: parsed.data.studentId, action: 'added' });
    res.status(201).json(membership);
  })
);

router.delete(
  '/cohorts/:cohortId/members/:studentId',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.params.cohortId as string;
    const studentId = req.params.studentId as string;
    await cohortService.removeMember(req.auth!.organizationId, cohortId, studentId);
    await recordAudit(req.auth!, 'MEMBERSHIP_CHANGED', { type: 'cohort', id: cohortId }, { studentId, action: 'removed' });
    res.status(204).send();
  })
);

// ── Aggregation trigger (normally event-driven — section 35 — this
// endpoint exists for manual/admin recompute and for demos) ──────────
router.post(
  '/cohorts/:cohortId/recompute',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    await aggregationService.recomputeAll(req.auth!.organizationId, req.params.cohortId as string);
    res.status(202).json({ status: 'recomputed' });
  })
);

// ── Intelligence reads (sections 47, 81) ──────────────────────────────

router.get(
  '/cohorts/:cohortId/overview',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.params.cohortId as string;
    const cacheKey = buildTenantCacheKey(req.auth!.organizationId, 'overview', cohortId);
    const cached = await cache.get(cacheKey);
    if (cached) {
      res.json(cached);
      return;
    }
    const overview = await getCohortExecutiveOverviewWithNarrative(req.auth!.organizationId, cohortId);
    await recordAudit(req.auth!, 'INTELLIGENCE_VIEWED', { type: 'cohort', id: cohortId }, { view: 'overview' });
    await cache.set(cacheKey, overview, 60);
    res.json(overview);
  })
);

router.get(
  '/cohorts/:cohortId/skills',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.params.cohortId as string;
    await cohortService.get(req.auth!.organizationId, cohortId);
    const skills = await repositories.skillAggregates.listLatestForCohort(req.auth!.organizationId, cohortId);
    res.json({ skills });
  })
);

router.get(
  '/cohorts/:cohortId/skills/:skillId/trend',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.params.cohortId as string;
    await cohortService.get(req.auth!.organizationId, cohortId);
    const history = await repositories.skillAggregates.listHistoryForSkill(
      req.auth!.organizationId,
      cohortId,
      req.params.skillId as string
    );
    res.json({ history });
  })
);

router.get(
  '/cohorts/:cohortId/roles',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.params.cohortId as string;
    await cohortService.get(req.auth!.organizationId, cohortId);
    const roles = await repositories.roleAggregates.listLatestForCohort(req.auth!.organizationId, cohortId);
    res.json({ roles });
  })
);

router.get(
  '/cohorts/:cohortId/training-priorities',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.params.cohortId as string;
    await cohortService.get(req.auth!.organizationId, cohortId);
    const insights = await repositories.trainingInsights.listForCohort(req.auth!.organizationId, cohortId);
    res.json({ trainingPriorities: insights });
  })
);

// ── Comparison (sections 38-39) ────────────────────────────────────────

const compareSchema = z.object({ cohortIdA: z.string().min(1), cohortIdB: z.string().min(1) });

router.post(
  '/cohorts/compare',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = compareSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid comparison payload.', parsed.error.flatten());
    const result = await compareCohorts(req.auth!.organizationId, parsed.data.cohortIdA, parsed.data.cohortIdB);
    await recordAudit(req.auth!, 'COMPARISON_REQUESTED', undefined, parsed.data);
    res.json(result);
  })
);

// ── Snapshots (sections 37, 78) ─────────────────────────────────────────

const snapshotSchema = z.object({
  periodLabel: z.string().min(1),
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
});

router.post(
  '/cohorts/:cohortId/snapshots',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = snapshotSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid snapshot payload.', parsed.error.flatten());
    const snapshot = await captureSnapshot(
      req.auth!.organizationId,
      req.params.cohortId as string,
      parsed.data.periodLabel,
      new Date(parsed.data.periodStart),
      new Date(parsed.data.periodEnd)
    );
    res.status(201).json(snapshot);
  })
);

router.get(
  '/cohorts/:cohortId/snapshots',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const snapshots = await listSnapshots(req.auth!.organizationId, req.params.cohortId as string);
    res.json({ snapshots });
  })
);

// ── Export (section 46) ─────────────────────────────────────────────────
router.get(
  '/cohorts/:cohortId/report',
  authorize(...READ_ROLES),
  asyncHandler(async (req, res) => {
    const format = (req.query.format as 'json' | 'csv') ?? 'json';
    const cohortId = req.params.cohortId as string;
    const report = await exportCohortReport(req.auth!.organizationId, cohortId, format);
    await recordAudit(req.auth!, 'REPORT_EXPORTED', { type: 'cohort', id: cohortId }, { format });
    res.setHeader('Content-Type', report.contentType);
    res.send(report.body);
  })
);

// ── Dashboards (sections 43-45) ─────────────────────────────────────────

router.get(
  '/dashboards/tpo',
  authorize(Role.TPO, ...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.query.cohortId as string | undefined;
    if (!cohortId) throw new ValidationError('cohortId query parameter is required.');
    res.json(await getTpoDashboard(req.auth!.organizationId, cohortId));
  })
);

router.get(
  '/dashboards/trainer',
  authorize(Role.TRAINER, ...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const cohortId = req.query.cohortId as string | undefined;
    if (!cohortId) throw new ValidationError('cohortId query parameter is required.');
    res.json(await getTrainerDashboard(req.auth!.organizationId, cohortId));
  })
);

router.get(
  '/dashboards/admin',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    res.json(await getAdminDashboard(req.auth!.organizationId));
  })
);

// ── Event ingestion (sections 35, 74-77) ────────────────────────────────

const eventSchema = z.object({
  studentId: z.string().min(1),
  cohortId: z.string().optional(),
  eventType: z.nativeEnum(IntelligenceEventType),
  sourceEventId: z.string().min(1),
  sourceTimestamp: z.string().datetime(),
  payload: z.record(z.unknown()).optional(),
});

router.post(
  '/events',
  authorize(...ADMIN_ROLES),
  asyncHandler(async (req, res) => {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) throw new ValidationError('Invalid event payload.', parsed.error.flatten());
    const result = await ingestIntelligenceEvent({ organizationId: req.auth!.organizationId, ...parsed.data });
    res.status(202).json(result);
  })
);

export { router as apiRouter };
