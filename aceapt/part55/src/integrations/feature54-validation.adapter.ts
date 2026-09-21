import type pg from 'pg';
import type { ValidationGate } from './types.js';

/**
 * Feature 54 — Question Validation adapter.
 *
 * TODO(integration): replace this body with a call into the real Feature 54
 * service/client. This SQL-backed version reads question_versions.is_valid,
 * the stand-in column defined in db/reference/000_assumed_existing_schema.sql,
 * purely so Feature 55 is runnable and testable without Feature 54's real
 * code. Every caller in this codebase depends on the ValidationGate
 * interface, never on this class, so swapping it is a one-file change.
 *
 * Takes tenantId explicitly (rather than relying on the RLS session
 * variable) because question_versions is a pre-existing table this
 * reference implementation's migrations don't enable RLS on — see the bug
 * note in DifficultyCalibrationService.calibrateQuestionVersion for why
 * that can't be assumed to be handled elsewhere.
 */
export class SqlValidationGate implements ValidationGate {
  constructor(
    private readonly client: pg.PoolClient | pg.Pool,
    private readonly tenantId: string
  ) {}

  async isValid(questionVersionId: string): Promise<boolean> {
    const { rows } = await this.client.query<{ is_valid: boolean }>(
      `SELECT is_valid FROM question_versions WHERE id = $1 AND tenant_id = $2`,
      [questionVersionId, this.tenantId]
    );
    // Unknown question version -> treat as NOT valid. An estimator that
    // can't find the version it's calibrating has a bigger problem than
    // difficulty, and §22 says invalid questions must never contribute.
    return rows[0]?.is_valid === true;
  }
}
