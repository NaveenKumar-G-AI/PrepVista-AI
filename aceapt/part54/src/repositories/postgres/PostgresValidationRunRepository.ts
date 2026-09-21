import pg from "pg";
import type { ValidationRunResult } from "../../contracts/types.js";
import type { ValidationRunRepository, ValidationAuditRepository, CallerContext, AuditEvent } from "../ValidationRunRepository.js";

/**
 * Connects as `qve_app` — the same role verified in test/integration/rls.postgres.test.ts
 * to have ZERO raw grants on any table. Every method below is a call to a
 * SECURITY DEFINER function; there is no code path in this class that could
 * even ATTEMPT a raw table query, because the connecting role isn't allowed one.
 */
export class PostgresValidationRunRepository implements ValidationRunRepository {
  constructor(private readonly pool: pg.Pool) {}

  async save(run: ValidationRunResult, tenantId: string | null, requestedBy: { role: string; id: string }): Promise<void> {
    const resultsJson = JSON.stringify(
      run.results.map((r) => ({
        validator_name: r.validator,
        category: r.category,
        validator_version: r.validatorVersion,
        status: r.status,
        severity: r.severity,
        code: r.code,
        message: r.message,
        evidence: r.evidence,
        duration_ms: r.durationMs,
        validated_at: r.validatedAt
      }))
    );

    await this.pool.query(
      `SELECT qve_insert_validation_run($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)`,
      [
        tenantId,
        run.questionId,
        run.versionId,
        run.versionNumber,
        run.contentHash,
        run.mode,
        run.profile,
        run.overallStatus,
        run.highestSeverity,
        run.blockingCodes,
        run.eligibility.practice,
        run.eligibility.timed,
        run.eligibility.assessment,
        JSON.stringify(run.validatorVersionSet),
        requestedBy.role,
        requestedBy.id,
        run.startedAt,
        run.completedAt,
        resultsJson
      ]
    );
  }

  async getById(caller: CallerContext, runId: string): Promise<ValidationRunResult | null> {
    const { rows } = await this.pool.query(`SELECT qve_get_run_by_id($1,$2,$3) AS run`, [caller.tenantId, caller.role, runId]);
    return rows[0]?.run ? mapRow(rows[0].run) : null;
  }

  async getLatestForVersion(caller: CallerContext, versionId: string): Promise<ValidationRunResult | null> {
    const { rows } = await this.pool.query(`SELECT qve_get_latest_run_for_version($1,$2,$3) AS run`, [caller.tenantId, caller.role, versionId]);
    return rows[0]?.run ? mapRow(rows[0].run) : null;
  }

  async getHistoryForQuestion(caller: CallerContext, questionId: string): Promise<ValidationRunResult[]> {
    const { rows } = await this.pool.query(`SELECT qve_get_validation_history($1,$2,$3) AS history`, [caller.tenantId, caller.role, questionId]);
    const history = rows[0]?.history ?? [];
    return (history as unknown[]).map(mapRow);
  }
}

export class PostgresValidationAuditRepository implements ValidationAuditRepository {
  constructor(private readonly pool: pg.Pool) {}

  async record(event: AuditEvent): Promise<string> {
    const { rows } = await this.pool.query(`SELECT qve_insert_audit_event($1,$2,$3,$4,$5,$6,$7) AS id`, [
      event.tenantId,
      event.questionId,
      event.validationRunId,
      event.actorRole,
      event.actorId,
      event.action,
      event.reason ?? null
    ]);
    return rows[0].id as string;
  }
}

// The JSONB shape built by qve_get_run_by_id already uses ValidationRunResult's
// own camelCase field names (see migration 003) — mapping is close to identity,
// kept explicit here so a future SQL-side rename doesn't silently drift.
function mapRow(row: any): ValidationRunResult {
  return {
    runId: row.runId,
    questionId: row.questionId,
    versionId: row.versionId,
    versionNumber: row.versionNumber,
    mode: row.mode,
    profile: row.profile,
    startedAt: row.startedAt,
    completedAt: row.completedAt,
    results: row.results ?? [],
    overallStatus: row.overallStatus,
    highestSeverity: row.highestSeverity,
    blockingCodes: row.blockingCodes ?? [],
    eligibility: row.eligibility,
    contentHash: row.contentHash,
    validatorVersionSet: row.validatorVersionSet
  };
}

export function createQveAppPool(connectionString?: string): pg.Pool {
  return new pg.Pool({ connectionString: connectionString ?? process.env.QVE_APP_DATABASE_URL });
}
