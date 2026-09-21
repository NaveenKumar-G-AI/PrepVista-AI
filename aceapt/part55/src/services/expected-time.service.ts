import type pg from 'pg';
import type { ExpectedTimeView } from '../integrations/types.js';

interface SnapshotTimeRow {
  median_time_ms: number | null;
  p25_time_ms: number | null;
  p75_time_ms: number | null;
  time_sample_size: number;
}

/**
 * Read-only view over the time statistics DifficultyEstimator already
 * computed and DifficultySnapshotService already published. This does NOT
 * recompute anything — §27/§81 want Feature 50 to consume a stable,
 * already-calibrated number, not trigger fresh statistics on every read.
 */
export class ExpectedTimeService {
  constructor(private readonly db: pg.PoolClient | pg.Pool) {}

  async getExpectedTime(
    questionVersionId: string,
    mode: 'UNTIMED' | 'TIMED' | 'OVERALL' = 'OVERALL',
    populationId = 'default'
  ): Promise<ExpectedTimeView> {
    const { rows } = await this.db.query<SnapshotTimeRow>(
      `SELECT median_time_ms, p25_time_ms, p75_time_ms, time_sample_size
       FROM difficulty_snapshots
       WHERE question_version_id = $1 AND mode::text = $2 AND population_id = $3 AND is_active = true`,
      [questionVersionId, mode, populationId]
    );
    const row = rows[0];
    if (!row) {
      return { medianMs: null, p25Ms: null, p75Ms: null, sampleSize: 0, reliable: false };
    }
    return {
      medianMs: row.median_time_ms,
      p25Ms: row.p25_time_ms,
      p75Ms: row.p75_time_ms,
      sampleSize: row.time_sample_size,
      reliable: row.time_sample_size > 0 && row.median_time_ms !== null,
    };
  }
}
