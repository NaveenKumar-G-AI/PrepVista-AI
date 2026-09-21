import type pg from 'pg';
import { calibrationConfig } from '../config/calibration.config.js';
import type {
  CalibrationComputation,
  DifficultyModeT,
  DifficultySource,
  ModeSnapshotEstimate,
} from '../types/difficulty.types.js';
import { DifficultyHistoryService } from './difficulty-history.service.js';

export interface PublishedSnapshotRow {
  id: string;
  mode: DifficultyModeT;
  isActive: boolean;
  category: string | null;
  status: string;
}

interface ActiveSnapshotRow {
  id: string;
  category: string | null;
  status: string;
  facility: string | null;
}

// NOTE (bug found by actually running this): median()/percentile() in
// lib/stats.ts use linear interpolation, so they can return a value like
// 50840.25 — but median_time_ms/p25_time_ms/p75_time_ms are INT columns.
// Postgres rejects a fractional string for an integer parameter outright
// (22P02), it doesn't round it for you.
function roundOrNull(ms: number | null): number | null {
  return ms === null ? null : Math.round(ms);
}

/**
 * Owns exactly one thing: turning a CalibrationComputation into durable,
 * atomically-published rows in difficulty_snapshots, with a full audit trail
 * and never a half-written state (§150-152).
 *
 * The `client` passed in MUST already be inside a transaction (see
 * DifficultyCalibrationService, which wraps every run in withTenant). If
 * anything below throws, the caller's transaction rolls back and the
 * previously-active snapshot is untouched — verified for real in
 * tests/difficulty-snapshot.test.ts by forcing a failure mid-publish.
 */
export class DifficultySnapshotService {
  private readonly history: DifficultyHistoryService;

  constructor(private readonly client: pg.PoolClient) {
    this.history = new DifficultyHistoryService(client);
  }

  private async getActive(
    tenantId: string,
    questionVersionId: string,
    populationId: string,
    mode: DifficultyModeT
  ): Promise<ActiveSnapshotRow | null> {
    const { rows } = await this.client.query<ActiveSnapshotRow>(
      `SELECT id, category, status, facility::text FROM difficulty_snapshots
       WHERE tenant_id = $1 AND question_version_id = $2 AND population_id = $3
             AND mode::text = $4 AND is_active = true`,
      [tenantId, questionVersionId, populationId, mode]
    );
    return rows[0] ?? null;
  }

  private async insertAndActivate(args: {
    tenantId: string;
    questionVersionId: string;
    populationId: string;
    mode: DifficultyModeT;
    est: ModeSnapshotEstimate;
    category: string | null;
    status: string;
    source: DifficultySource;
    method: string;
    discrimination: { value: number | null; sampleSize: number } | null;
    labelMismatch: boolean;
    initialCategory: string | null;
    contentHash: string;
    calibrationRunId: string | null;
  }): Promise<string> {
    const previous = await this.getActive(args.tenantId, args.questionVersionId, args.populationId, args.mode);
    // NOTE (bug found by actually running this): reusing the $12 (status)
    // parameter inside a `CASE WHEN $12 = 'CALIBRATED'` text comparison,
    // while it's ALSO bound to the enum-typed `status` column two lines up,
    // makes Postgres deduce two different types for the same parameter
    // ("inconsistent types deduced for parameter $12" / 42P08) — same root
    // cause as the one fixed in DifficultyCalibrationService.finishRun.
    // Computing calibratedAt in JS sidesteps it rather than adding a cast.
    const calibratedAt = args.status === 'CALIBRATED' ? new Date() : null;

    const { rows } = await this.client.query<{ id: string }>(
      `INSERT INTO difficulty_snapshots (
         tenant_id, question_version_id, population_id, mode,
         estimate, facility, ci_low, ci_high, sample_size, confidence,
         category, status, source, method,
         median_time_ms, p25_time_ms, p75_time_ms, time_sample_size,
         discrimination, discrimination_sample_size,
         label_mismatch, initial_category,
         content_hash_at_calibration, calibration_run_id,
         is_active, calibrated_at
       ) VALUES (
         $1,$2,$3,$4,
         $5,$6,$7,$8,$9,$10,
         $11,$12,$13,$14,
         $15,$16,$17,$18,
         $19,$20,
         $21,$22,
         $23,$24,
         false, $25
       ) RETURNING id`,
      [
        args.tenantId,
        args.questionVersionId,
        args.populationId,
        args.mode,
        1 - args.est.facility.facility,
        args.est.facility.facility,
        args.est.facility.ciLow,
        args.est.facility.ciHigh,
        args.est.facility.sampleSize,
        args.est.facility.confidence,
        args.category,
        args.status,
        args.source,
        args.method,
        roundOrNull(args.est.time.medianMs),
        roundOrNull(args.est.time.p25Ms),
        roundOrNull(args.est.time.p75Ms),
        args.est.time.sampleSize,
        args.discrimination?.value ?? null,
        args.discrimination?.sampleSize ?? 0,
        args.labelMismatch,
        args.initialCategory,
        args.contentHash,
        args.calibrationRunId,
        calibratedAt,
      ]
    );
    const newId = rows[0]?.id;
    if (!newId) throw new Error('Snapshot insert did not return an id — refusing to activate nothing');

    if (previous) {
      await this.client.query(
        `UPDATE difficulty_snapshots
         SET is_active = false, superseded_at = now(), superseded_by = $1
         WHERE id = $2`,
        [newId, previous.id]
      );
    }
    await this.client.query(`UPDATE difficulty_snapshots SET is_active = true WHERE id = $1`, [newId]);

    // Audit trail — one row per publish event, plus one per changed field.
    const reason = previous ? 'recalibration' : 'initial_snapshot_created';
    await this.history.record({
      tenantId: args.tenantId,
      questionVersionId: args.questionVersionId,
      snapshotId: newId,
      previousSnapshotId: previous?.id ?? null,
      fieldChanged: 'facility',
      oldValue: previous?.facility ?? null,
      newValue: String(args.est.facility.facility),
      reason,
    });
    if (previous && previous.category !== args.category) {
      await this.history.record({
        tenantId: args.tenantId,
        questionVersionId: args.questionVersionId,
        snapshotId: newId,
        previousSnapshotId: previous.id,
        fieldChanged: 'category',
        oldValue: previous.category,
        newValue: args.category,
        reason: args.labelMismatch
          ? 'empirical_evidence_diverged_from_initial_label'
          : reason,
      });
    }
    if (previous && previous.status !== args.status) {
      await this.history.record({
        tenantId: args.tenantId,
        questionVersionId: args.questionVersionId,
        snapshotId: newId,
        previousSnapshotId: previous.id,
        fieldChanged: 'status',
        oldValue: previous.status,
        newValue: args.status,
        reason,
      });
    }

    return newId;
  }

  /** Publishes OVERALL plus every conditioned mode present in the
   * computation, atomically, within the caller's existing transaction. */
  async publish(args: {
    tenantId: string;
    populationId: string;
    computation: CalibrationComputation;
    source: DifficultySource;
    method: string;
    calibrationRunId: string | null;
  }): Promise<PublishedSnapshotRow[]> {
    const { computation } = args;
    const published: PublishedSnapshotRow[] = [];

    const overallId = await this.insertAndActivate({
      tenantId: args.tenantId,
      questionVersionId: computation.questionVersionId,
      populationId: args.populationId,
      mode: 'OVERALL',
      est: computation.overall,
      category: computation.category,
      status: computation.status,
      source: args.source,
      method: args.method,
      discrimination: computation.discrimination.reliable
        ? { value: computation.discrimination.value, sampleSize: computation.discrimination.sampleSize }
        : null,
      labelMismatch: computation.labelMismatch,
      initialCategory: computation.initialCategory,
      contentHash: computation.contentHash,
      calibrationRunId: args.calibrationRunId,
    });
    published.push({
      id: overallId,
      mode: 'OVERALL',
      isActive: true,
      category: computation.category,
      status: computation.status,
    });

    for (const modeEst of computation.conditioned) {
      // NOTE (bug found by inspecting real seeded output): a conditioned
      // subset's sample size is a subset of OVERALL's by construction, so
      // comparing it TO overall's sample size was tautologically always
      // false — every conditioned mode was landing PROVISIONAL forever
      // regardless of its own evidence. The conditioned mode's status
      // should be judged the same way OVERALL's is: against its OWN sample
      // size, not against a total it can never match.
      const modeStatus: 'CALIBRATED' | 'PROVISIONAL' =
        modeEst.facility.sampleSize >= calibrationConfig.sampleSize.calibratedMin
          ? 'CALIBRATED'
          : 'PROVISIONAL';
      const id = await this.insertAndActivate({
        tenantId: args.tenantId,
        questionVersionId: computation.questionVersionId,
        populationId: args.populationId,
        mode: modeEst.mode,
        est: modeEst,
        category: null, // conditioned modes are admin/API context, not a separate student label
        status: modeStatus,
        source: args.source,
        method: args.method,
        discrimination: null,
        labelMismatch: false,
        initialCategory: null,
        contentHash: computation.contentHash,
        calibrationRunId: args.calibrationRunId,
      });
      published.push({ id, mode: modeEst.mode, isActive: true, category: null, status: modeStatus });
    }

    return published;
  }

  /** §143-144: mark the active OVERALL snapshot STALE without deleting it,
   * when the question version's content has materially changed since it was
   * calibrated. Does not itself decide "materially" — see
   * content-change-impact in the calibration orchestrator. */
  async markStale(tenantId: string, questionVersionId: string, populationId: string, reason: string): Promise<void> {
    const { rows } = await this.client.query<{ id: string; status: string }>(
      `UPDATE difficulty_snapshots
       SET status = 'STALE'
       WHERE tenant_id = $1 AND question_version_id = $2 AND population_id = $3
             AND mode = 'OVERALL' AND is_active = true AND status != 'STALE'
       RETURNING id, status`,
      [tenantId, questionVersionId, populationId]
    );
    if (rows[0]) {
      await this.history.record({
        tenantId,
        questionVersionId,
        snapshotId: rows[0].id,
        previousSnapshotId: rows[0].id,
        fieldChanged: 'status',
        oldValue: 'CALIBRATED',
        newValue: 'STALE',
        reason,
      });
    }
  }

  async getActiveSnapshot(
    tenantId: string,
    questionVersionId: string,
    populationId = 'default',
    mode: DifficultyModeT = 'OVERALL'
  ) {
    const { rows } = await this.client.query(
      `SELECT * FROM difficulty_snapshots
       WHERE tenant_id = $1 AND question_version_id = $2 AND population_id = $3
             AND mode::text = $4 AND is_active = true`,
      [tenantId, questionVersionId, populationId, mode]
    );
    return rows[0] ?? null;
  }
}
