import type { Request, Response } from 'express';
import { z } from 'zod';
import { DifficultyCalibrationService } from '../services/difficulty-calibration.service.js';
import { CalibrationEligibilityService } from '../services/calibration-eligibility.service.js';
import { SqlValidationGate } from '../integrations/feature54-validation.adapter.js';
import { SqlQualityGate } from '../integrations/feature53-quality.adapter.js';
import { PassthroughNoveltyAdapter } from '../integrations/feature49-novelty.adapter.js';
import { DifficultyReviewService, type ReviewActionType } from '../services/difficulty-review.service.js';
import {
  StudentDifficultyReadService,
  derivePersonalChallenge,
} from '../services/student-difficulty-read.service.js';
import { ExpectedTimeService } from '../services/expected-time.service.js';
import { withTenant, appPool } from '../db/pool.js';
import type { DifficultyModeT } from '../types/difficulty.types.js';

const uuidSchema = z.string().uuid();
const modeSchema = z
  .enum(['OVERALL', 'UNTIMED', 'TIMED', 'FAMILIAR', 'NOVEL', 'INDEPENDENT', 'GUIDED'])
  .default('OVERALL');

export function makeDifficultyController(calibrationService: DifficultyCalibrationService) {
  return {
    // ---- Admin --------------------------------------------------------

    async getQuestionDifficulty(req: Request, res: Response) {
      const questionVersionId = uuidSchema.parse(req.params.questionVersionId);
      const mode = modeSchema.parse(req.query.mode ?? 'OVERALL') as DifficultyModeT;
      const populationId = (req.query.populationId as string) ?? 'default';
      const tenantId = req.auth!.tenantId;

      let snapshot = await calibrationService.getQuestionDifficulty(tenantId, questionVersionId, populationId, mode);
      if (!snapshot && mode === 'OVERALL') {
        // §59: never a bare 404 for a real question — run a first pass so
        // even a zero-attempt question returns a provisional answer.
        await calibrationService.calibrateQuestionVersion(tenantId, questionVersionId, { triggeredBy: 'lazy_seed_on_read' });
        snapshot = await calibrationService.getQuestionDifficulty(tenantId, questionVersionId, populationId, mode);
      }
      if (!snapshot) {
        res.status(404).json({ error: 'No difficulty data for this question version' });
        return;
      }
      res.json(snapshot);
    },

    async getDifficultyHistory(req: Request, res: Response) {
      const questionVersionId = uuidSchema.parse(req.params.questionVersionId);
      const history = await calibrationService.getDifficultyHistory(req.auth!.tenantId, questionVersionId);
      res.json({ history });
    },

    async getDifficultyEvidence(req: Request, res: Response) {
      const questionVersionId = uuidSchema.parse(req.params.questionVersionId);
      const tenantId = req.auth!.tenantId;
      const evidence = await withTenant(appPool, tenantId, async (client) => {
        const eligibilityService = new CalibrationEligibilityService(
          client,
          new SqlValidationGate(client, tenantId),
          new SqlQualityGate(client, tenantId),
          new PassthroughNoveltyAdapter()
        );
        return eligibilityService.getEligibleObservations(questionVersionId, { tenantId });
      });
      res.json({
        questionVersionValid: evidence.questionVersionValid,
        qualityBlocksCalibration: evidence.qualityBlocksCalibration,
        eligibleCount: evidence.eligible.length,
        excludedCount: evidence.excluded.length,
        excludedByReason: evidence.excluded.reduce<Record<string, number>>((acc, e) => {
          acc[e.reason] = (acc[e.reason] ?? 0) + 1;
          return acc;
        }, {}),
      });
    },

    async recalibrateQuestion(req: Request, res: Response) {
      const questionVersionId = uuidSchema.parse(req.params.questionVersionId);
      const result = await calibrationService.calibrateQuestionVersion(req.auth!.tenantId, questionVersionId, {
        triggeredBy: `admin:${req.auth!.userId}`,
        force: true,
      });
      res.status(202).json(result);
    },

    async getCalibrationCenterSummary(req: Request, res: Response) {
      const summary = await calibrationService.getCalibrationCenterSummary(req.auth!.tenantId);
      res.json(summary);
    },

    async getAnomalies(req: Request, res: Response) {
      const status = req.query.status as string | undefined;
      const type = req.query.type as string | undefined;
      const anomalies = await calibrationService.getAnomalies(req.auth!.tenantId, { status, type });
      res.json({ anomalies });
    },

    async submitReview(req: Request, res: Response) {
      const bodySchema = z.object({
        questionVersionId: uuidSchema,
        anomalyId: uuidSchema.nullable().default(null),
        action: z.enum(['APPROVE', 'HOLD', 'REQUEST_RECALIBRATION', 'DISMISS']),
        notes: z.string().max(2000).optional(),
      });
      const body = bodySchema.parse(req.body);
      const reviewService = new DifficultyReviewService(appPool);
      await reviewService.submitReview({
        tenantId: req.auth!.tenantId,
        questionVersionId: body.questionVersionId,
        anomalyId: body.anomalyId,
        action: body.action as ReviewActionType,
        actor: req.auth!.userId,
        notes: body.notes,
      });

      if (body.action === 'REQUEST_RECALIBRATION') {
        await calibrationService.calibrateQuestionVersion(req.auth!.tenantId, body.questionVersionId, {
          triggeredBy: `admin_review:${req.auth!.userId}`,
          force: true,
        });
      }
      res.status(202).json({ ok: true });
    },

    async getSkillDifficultyDistribution(req: Request, res: Response) {
      const skillId = uuidSchema.parse(req.params.skillId);
      const distribution = await calibrationService.getSkillDifficultyDistribution(req.auth!.tenantId, skillId);
      res.json({ distribution });
    },

    // ---- Outbound (Feature 50 expected time) ---------------------------

    async getExpectedTime(req: Request, res: Response) {
      const questionVersionId = uuidSchema.parse(req.params.questionVersionId);
      const mode = z.enum(['OVERALL', 'UNTIMED', 'TIMED']).default('OVERALL').parse(req.query.mode ?? 'OVERALL');
      const result = await withTenant(appPool, req.auth!.tenantId, async (client) => {
        const svc = new ExpectedTimeService(client);
        return svc.getExpectedTime(questionVersionId, mode);
      });
      res.json(result);
    },

    // ---- Student --------------------------------------------------------

    async getStudentDifficulty(req: Request, res: Response, studentReadService: StudentDifficultyReadService) {
      const questionVersionId = uuidSchema.parse(req.params.questionVersionId);
      const abilityBucket = z
        .enum(['BELOW', 'AT', 'ABOVE'])
        .nullable()
        .default(null)
        .parse(req.query.myAbility ?? null);

      const view = await studentReadService.getDifficulty(req.auth!.tenantId, questionVersionId);
      if (!view) {
        res.json({ questionVersionId, category: 'MEDIUM', recommended: true, provisional: true });
        return;
      }
      const personalChallenge = derivePersonalChallenge(view.category, abilityBucket);
      res.json({
        questionVersionId: view.questionVersionId,
        category: view.category,
        recommended: view.isWellEstablished,
        personalChallenge,
      });
    },
  };
}
