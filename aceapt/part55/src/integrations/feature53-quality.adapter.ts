import type pg from 'pg';
import type { QualityGate, QualityVerdict } from './types.js';

/**
 * Feature 53 — Question Quality adapter.
 *
 * TODO(integration): replace this body with a call into the real Feature 53
 * service/client. Reads question_versions.quality_status, the stand-in
 * column in db/reference/000_assumed_existing_schema.sql. POOR blocks
 * calibration outright (§23); UNRESOLVED is surfaced but does not block —
 * that split is itself a policy decision real Feature 53 integration should
 * confirm, not something Feature 55 should assume silently.
 */
export class SqlQualityGate implements QualityGate {
  constructor(
    private readonly client: pg.PoolClient | pg.Pool,
    private readonly tenantId: string
  ) {}

  async getQualityVerdict(questionVersionId: string): Promise<QualityVerdict> {
    const { rows } = await this.client.query<{ quality_status: string }>(
      `SELECT quality_status FROM question_versions WHERE id = $1 AND tenant_id = $2`,
      [questionVersionId, this.tenantId]
    );
    const status = (rows[0]?.quality_status ?? 'POOR') as QualityVerdict['status'];
    return {
      status,
      blocksCalibration: status === 'POOR',
    };
  }
}
