import type pg from 'pg';
import { calibrationConfig } from '../config/calibration.config.js';

/**
 * §147-148, §193-194: cache dimensions are (question_version content hash,
 * method, population, mode). Rather than standing up a separate cache store,
 * this reuses difficulty_snapshots itself as the cache — if an active
 * snapshot already matches the current content hash and was calibrated
 * within the TTL window, recalibration is skipped. A content-hash change
 * (i.e. the question actually changed) invalidates it implicitly, because
 * the hash simply won't match anymore (§194) — no separate invalidation
 * bookkeeping needed.
 */
export class CalibrationCacheService {
  constructor(private readonly client: pg.PoolClient | pg.Pool) {}

  async isFresh(
    tenantId: string,
    questionVersionId: string,
    populationId: string,
    method: string,
    currentContentHash: string
  ): Promise<boolean> {
    // NOTE (bug found by running the test suite): this originally gated
    // freshness on `calibrated_at`, which is ONLY set once a snapshot
    // reaches CALIBRATED status (see DifficultySnapshotService). A
    // low-sample PROVISIONAL question would have calibrated_at = NULL
    // forever, so isFresh() could never return true for it — every read
    // would re-run the full pipeline every single time, which is exactly
    // the "don't recalculate every question" waste §148 is about avoiding.
    // `created_at` is set unconditionally on every snapshot row regardless
    // of status, which is what "was this actually (re)computed recently"
    // should mean here — CALIBRATED-ness is a separate concern from cache
    // freshness.
    const { rows } = await this.client.query<{ fresh: boolean }>(
      `SELECT (
         content_hash_at_calibration = $5
         AND method = $4
         AND created_at > now() - ($6 || ' seconds')::interval
       ) AS fresh
       FROM difficulty_snapshots
       WHERE tenant_id = $1 AND question_version_id = $2 AND population_id = $3
             AND mode = 'OVERALL' AND is_active = true`,
      [tenantId, questionVersionId, populationId, method, currentContentHash, calibrationConfig.cache.ttlSeconds]
    );
    return rows[0]?.fresh === true;
  }
}
