import type pg from 'pg';
import { withTenant } from '../db/pool.js';
import { calibrationConfig } from '../config/calibration.config.js';
import { CalibrationEligibilityService } from './calibration-eligibility.service.js';
import { DifficultyEstimator } from './difficulty-estimator.service.js';
import { DifficultySnapshotService, type PublishedSnapshotRow } from './difficulty-snapshot.service.js';
import { DifficultyAnomalyService, type AnomalyCandidate } from './difficulty-anomaly.service.js';
import { DifficultyDriftService } from './difficulty-drift.service.js';
import { CalibrationCacheService } from './calibration-cache.service.js';
import { InitialDifficultyService } from './initial-difficulty.service.js';
import { DifficultyHistoryService } from './difficulty-history.service.js';
import { SqlValidationGate } from '../integrations/feature54-validation.adapter.js';
import { SqlQualityGate } from '../integrations/feature53-quality.adapter.js';
import { PassthroughNoveltyAdapter } from '../integrations/feature49-novelty.adapter.js';
import type { InitialDifficultyAiAdapter } from '../ai/initial-difficulty-ai.adapter.js';
import type { DifficultyModeT } from '../types/difficulty.types.js';

export type CalibrationSkipReason =
  | 'QUESTION_INVALID'
  | 'QUALITY_BLOCKS_CALIBRATION'
  | 'CACHE_FRESH';

export interface CalibrationRunResult {
  runId: string;
  questionVersionId: string;
  skipped: boolean;
  skipReason?: CalibrationSkipReason;
  publishedSnapshots?: PublishedSnapshotRow[];
  anomaliesDetected?: string[];
  driftDetected?: boolean;
  sampleSize?: number;
  status?: string;
  category?: string | null;
}

/**
 * The single entry point that runs the full §220-221 lifecycle for one
 * question version: eligibility -> estimate -> uncertainty -> snapshot ->
 * label-mismatch check -> anomaly detection -> drift detection -> atomic
 * publish. Everything from "filter eligible data" through "publish
 * calibrated difficulty" happens inside one transaction (via withTenant),
 * so a failure anywhere in that chain leaves the previously-active snapshot
 * completely untouched (§150-152).
 *
 * Run-status bookkeeping (difficulty_calibration_runs) intentionally lives
 * OUTSIDE that transaction — a run needs to be able to record FAILED even
 * though everything it attempted to write got rolled back.
 */
export class DifficultyCalibrationService {
  private readonly estimator = new DifficultyEstimator();

  constructor(
    private readonly pool: pg.Pool,
    private readonly aiAdapter: InitialDifficultyAiAdapter,
    private readonly useAi: boolean = true
  ) {}

  private async createRun(
    tenantId: string,
    questionVersionId: string,
    method: string,
    triggeredBy: string
  ): Promise<string> {
    return withTenant(this.pool, tenantId, async (client) => {
      const { rows } = await client.query<{ id: string }>(
        `INSERT INTO difficulty_calibration_runs
          (tenant_id, scope, question_version_id, method, status, triggered_by, started_at)
         VALUES ($1,'SINGLE_QUESTION',$2,$3,'RUNNING',$4, now())
         RETURNING id`,
        [tenantId, questionVersionId, method, triggeredBy]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('Failed to create calibration run row');
      return id;
    });
  }

  private async finishRun(
    tenantId: string,
    runId: string,
    status: 'SUCCEEDED' | 'FAILED',
    error?: string
  ): Promise<void> {
    // NOTE (bug found by actually running this): using the same $1
    // parameter both as the enum-typed `status` column value AND inside a
    // `CASE WHEN $1 = 'SUCCEEDED'` text comparison makes Postgres deduce two
    // different types for the one parameter ("inconsistent types deduced
    // for parameter $1" / 42P08). Passing succeeded as its own bound
    // boolean sidesteps the ambiguity entirely instead of sprinkling casts.
    const succeeded = status === 'SUCCEEDED';
    await withTenant(this.pool, tenantId, async (client) => {
      await client.query(
        `UPDATE difficulty_calibration_runs
         SET status = $1::calibration_run_status, completed_at = now(), error = $2,
             questions_processed = CASE WHEN $4 THEN 1 ELSE 0 END,
             questions_failed = CASE WHEN $4 THEN 0 ELSE 1 END
         WHERE id = $3`,
        [status, error ?? null, runId, succeeded]
      );
    });
  }

  async calibrateQuestionVersion(
    tenantId: string,
    questionVersionId: string,
    opts: { populationId?: string; method?: string; triggeredBy?: string; force?: boolean } = {}
  ): Promise<CalibrationRunResult> {
    const populationId = opts.populationId ?? 'default';
    const method = opts.method ?? 'P0_FACILITY';
    const triggeredBy = opts.triggeredBy ?? 'SYSTEM';

    const runId = await this.createRun(tenantId, questionVersionId, method, triggeredBy);

    try {
      const result = await withTenant(this.pool, tenantId, async (client) => {
        const validationGate = new SqlValidationGate(client, tenantId);
        const qualityGate = new SqlQualityGate(client, tenantId);
        const noveltyAdapter = new PassthroughNoveltyAdapter();
        const eligibilityService = new CalibrationEligibilityService(
          client,
          validationGate,
          qualityGate,
          noveltyAdapter
        );
        const snapshotService = new DifficultySnapshotService(client);
        const anomalyService = new DifficultyAnomalyService(client);
        const driftService = new DifficultyDriftService(this.estimator);
        const cacheService = new CalibrationCacheService(client);
        const initialService = new InitialDifficultyService(client, this.aiAdapter, this.useAi);
        const historyService = new DifficultyHistoryService(client);

        // NOTE (bug found by an automated cross-tenant test, not just manual
        // RLS checks): question_versions/attempts are the pre-existing
        // ACEAPT tables Feature 55 reads but doesn't own (see
        // db/reference/000_assumed_existing_schema.sql), so they aren't
        // covered by the RLS policies in migrations/002_roles_and_rls.sql —
        // those only protect the difficulty_* tables Feature 55 itself
        // owns. Without an explicit tenant_id check here, a request scoped
        // to tenant B could look up a question_version_id that actually
        // belongs to tenant A (RLS on question_versions is whatever the
        // REAL system already has, and this reference implementation's
        // stand-in schema has none), and this pipeline would silently
        // compute and attempt to publish a snapshot for tenant B against
        // tenant A's data — which then collided with tenant A's own active
        // snapshot on uq_active_snapshot and threw, rather than failing
        // cleanly. This checks tenant_id explicitly as defense in depth,
        // exactly as the real integration should even where the real
        // question_versions table DOES have its own tenant scoping —
        // Feature 55 should never assume another table's isolation is
        // airtight rather than checking the one fact it actually needs.
        const { rows: qvRows } = await client.query<{ content_hash: string }>(
          `SELECT content_hash FROM question_versions WHERE id = $1 AND tenant_id = $2`,
          [questionVersionId, tenantId]
        );
        const currentContentHash = qvRows[0]?.content_hash;
        if (!currentContentHash) {
          throw new Error(`Question version ${questionVersionId} not found for tenant ${tenantId}`);
        }

        if (!opts.force) {
          const fresh = await cacheService.isFresh(
            tenantId,
            questionVersionId,
            populationId,
            method,
            currentContentHash
          );
          if (fresh) {
            return { skipped: true, skipReason: 'CACHE_FRESH' as const };
          }
        }

        const eligibility = await eligibilityService.getEligibleObservations(questionVersionId, { tenantId });

        if (!eligibility.questionVersionValid) {
          return { skipped: true, skipReason: 'QUESTION_INVALID' as const };
        }
        if (eligibility.qualityBlocksCalibration) {
          return { skipped: true, skipReason: 'QUALITY_BLOCKS_CALIBRATION' as const };
        }

        // Seed (or refresh, if content changed) the initial estimate.
        const { rows: initialRows } = await client.query<{
          combined_category: string | null;
          content_hash: string | null;
        }>(
          `SELECT ie.combined_category, s.content_hash_at_calibration AS content_hash
           FROM difficulty_initial_estimates ie
           LEFT JOIN difficulty_snapshots s
             ON s.question_version_id = ie.question_version_id AND s.is_active = true AND s.mode = 'OVERALL'
           WHERE ie.question_version_id = $1
           ORDER BY ie.created_at DESC LIMIT 1`,
          [questionVersionId]
        );
        let initialCategory = initialRows[0]?.combined_category as
          | 'EASY'
          | 'MEDIUM'
          | 'HARD'
          | null
          | undefined;
        const priorCalibrationHash = initialRows[0]?.content_hash;

        const contentChanged = priorCalibrationHash != null && priorCalibrationHash !== currentContentHash;
        if (contentChanged) {
          await snapshotService.markStale(
            tenantId,
            questionVersionId,
            populationId,
            'content_hash_changed_since_last_calibration'
          );
        }

        if (!initialCategory || contentChanged) {
          const seeded = await initialService.computeAndStore(tenantId, questionVersionId);
          initialCategory = seeded.combinedCategory ?? null;
        }

        const previousSnapshot = await snapshotService.getActiveSnapshot(
          tenantId,
          questionVersionId,
          populationId,
          'OVERALL'
        );

        const computation = this.estimator.compute({
          questionVersionId,
          populationId,
          observations: eligibility.eligible,
          initialCategory: initialCategory ?? null,
          contentHash: currentContentHash,
        });

        const published = await snapshotService.publish({
          tenantId,
          populationId,
          computation,
          source: computation.overall.facility.sampleSize > 0 ? 'EMPIRICAL' : 'STRUCTURAL',
          method,
          calibrationRunId: runId,
        });

        const anomalyCandidates: AnomalyCandidate[] = anomalyService.detect(computation, {
          previousMedianTimeMs: previousSnapshot?.median_time_ms ?? null,
        });

        let driftDetected = false;
        if (previousSnapshot?.status === 'CALIBRATED' && computation.status === 'CALIBRATED') {
          const recentObservations = await eligibilityService.getEligibleObservations(questionVersionId, {
            tenantId,
            sinceDays: calibrationConfig.drift.recentWindowDays,
          });
          const driftResult = driftService.evaluate(
            { facility: Number(previousSnapshot.facility), sampleSize: previousSnapshot.sample_size },
            recentObservations.eligible
          );
          const driftCandidate = driftService.toAnomalyCandidate(driftResult);
          if (driftCandidate) {
            anomalyCandidates.push(driftCandidate);
            driftDetected = true;
          }
        }

        const overallSnapshotId = published.find((p) => p.mode === 'OVERALL')!.id;
        await anomalyService.persist(tenantId, questionVersionId, overallSnapshotId, anomalyCandidates);

        // §142: always leave a freshness trail, even when nothing else changed.
        await historyService.record({
          tenantId,
          questionVersionId,
          snapshotId: overallSnapshotId,
          previousSnapshotId: previousSnapshot?.id ?? null,
          fieldChanged: 'sample_size',
          oldValue: previousSnapshot ? String(previousSnapshot.sample_size) : null,
          newValue: String(computation.overall.facility.sampleSize),
          reason: 'calibration_run_completed',
        });

        return {
          skipped: false,
          publishedSnapshots: published,
          anomaliesDetected: anomalyCandidates.map((a) => a.type),
          driftDetected,
          sampleSize: computation.overall.facility.sampleSize,
          status: computation.status,
          category: computation.category,
        };
      });

      await this.finishRun(tenantId, runId, 'SUCCEEDED');
      return { runId, questionVersionId, ...result };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.finishRun(tenantId, runId, 'FAILED', message);
      throw err;
    }
  }

  /** Read path for Feature 43/50/51/52 and the student/admin APIs. Returns
   * null if nothing has ever been calibrated for this version — the caller
   * (API layer) is responsible for deciding whether to trigger a first-time
   * calibration run or just report "not yet available" (see
   * api/difficulty.controller.ts, which does the former). */
  async getQuestionDifficulty(
    tenantId: string,
    questionVersionId: string,
    populationId = 'default',
    mode: DifficultyModeT = 'OVERALL'
  ) {
    return withTenant(this.pool, tenantId, async (client) => {
      const snapshotService = new DifficultySnapshotService(client);
      return snapshotService.getActiveSnapshot(tenantId, questionVersionId, populationId, mode);
    });
  }

  async getDifficultyHistory(tenantId: string, questionVersionId: string) {
    return withTenant(this.pool, tenantId, async (client) => {
      const historyService = new DifficultyHistoryService(client);
      return historyService.getHistory(questionVersionId);
    });
  }

  async getAnomalies(tenantId: string, filters: { status?: string; type?: string } = {}) {
    return withTenant(this.pool, tenantId, async (client) => {
      const conditions: string[] = ['tenant_id = $1'];
      const params: unknown[] = [tenantId];
      if (filters.status) {
        params.push(filters.status);
        conditions.push(`status::text = $${params.length}`);
      }
      if (filters.type) {
        params.push(filters.type);
        conditions.push(`type::text = $${params.length}`);
      }
      const { rows } = await client.query(
        `SELECT * FROM difficulty_anomalies WHERE ${conditions.join(' AND ')} ORDER BY detected_at DESC LIMIT 200`,
        params
      );
      return rows;
    });
  }

  async getCalibrationCenterSummary(tenantId: string) {
    return withTenant(this.pool, tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT
           count(*) FILTER (WHERE is_active) AS total,
           count(*) FILTER (WHERE is_active AND status = 'CALIBRATED') AS calibrated,
           count(*) FILTER (WHERE is_active AND status = 'PROVISIONAL') AS provisional,
           count(*) FILTER (WHERE is_active AND status = 'STALE') AS stale,
           count(*) FILTER (WHERE is_active AND status = 'NEEDS_REVIEW') AS needs_review,
           count(*) FILTER (WHERE is_active AND status = 'PROVISIONAL' AND sample_size < $2) AS insufficient_data
         FROM difficulty_snapshots
         WHERE tenant_id = $1 AND mode = 'OVERALL'`,
        [tenantId, calibrationConfig.sampleSize.categoryEmpiricalMin]
      );
      const { rows: anomalyRows } = await client.query(
        `SELECT count(*) AS open_anomalies FROM difficulty_anomalies WHERE tenant_id = $1 AND status = 'OPEN'`,
        [tenantId]
      );
      return { ...rows[0], openAnomalies: anomalyRows[0]?.open_anomalies ?? 0 };
    });
  }

  async getSkillDifficultyDistribution(tenantId: string, skillId: string) {
    return withTenant(this.pool, tenantId, async (client) => {
      const { rows } = await client.query(
        `SELECT ds.category, count(*) AS count
         FROM difficulty_snapshots ds
         JOIN question_versions qv ON qv.id = ds.question_version_id
         JOIN questions q ON q.id = qv.question_id
         WHERE ds.tenant_id = $1 AND ds.is_active = true AND ds.mode = 'OVERALL' AND q.skill_id = $2
         GROUP BY ds.category`,
        [tenantId, skillId]
      );
      return rows;
    });
  }
}
