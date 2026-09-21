import pg from "pg";
import type { GapHistoryEntry } from "../domain/types.js";
import type { GapRepositoryPort, PersistedGapSnapshot } from "../ports/index.js";

const { Pool } = pg;

/**
 * Real persistence adapter backed by the migrations in db/migrations.
 * Every query is scoped by organization_id in the WHERE clause AND relies
 * on the RLS policy as a second, server-enforced layer (Phase 49) - never
 * trust a single layer for tenant isolation.
 *
 * `withTenantContext` sets the session-local `app.current_organization_id`
 * that the RLS policies check, inside the same transaction as the query,
 * so a bug in the WHERE clause still cannot cross tenants.
 */
export class PostgresGapRepositoryAdapter implements GapRepositoryPort {
  private pool: pg.Pool;

  constructor(connectionString: string = process.env.DATABASE_URL ?? "") {
    if (!connectionString) {
      throw new Error(
        "DATABASE_URL is not set. Point it at your CodeForge Postgres instance before using this adapter.",
      );
    }
    this.pool = new Pool({ connectionString });
  }

  private async withTenantContext<T>(organizationId: string, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.current_organization_id', $1, true)", [organizationId]);
      const result = await fn(client);
      await client.query("COMMIT");
      return result;
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }

  async getSnapshot(
    organizationId: string,
    studentId: string,
    roleId: string,
    skillId: string,
  ): Promise<PersistedGapSnapshot | null> {
    return this.withTenantContext(organizationId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM role_skill_gap_snapshots
         WHERE organization_id = $1 AND student_id = $2 AND role_id = $3 AND skill_id = $4`,
        [organizationId, studentId, roleId, skillId],
      );
      return rows[0] ? rowToSnapshot(rows[0]) : null;
    });
  }

  async saveSnapshot(snapshot: PersistedGapSnapshot): Promise<void> {
    await this.withTenantContext(snapshot.organizationId, async (client) => {
      await client.query(
        `INSERT INTO role_skill_gap_snapshots (
           organization_id, student_id, role_id, role_model_version, gap_algorithm_version,
           skill_id, skill_name, importance, current_mastery_level, current_state_label,
           target_mastery_level, target_state_label, gap_status, gap_magnitude, severity,
           priority_score, priority_rank, confidence, confidence_factors, trend, consistency,
           closure_state, closure_reason, is_root_gap, dependency_annotation,
           evidence_summary, explanation, ai_explanation, calculated_at, updated_at
         ) VALUES (
           $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29, now()
         )
         ON CONFLICT (organization_id, student_id, role_id, skill_id) DO UPDATE SET
           role_model_version = EXCLUDED.role_model_version,
           gap_algorithm_version = EXCLUDED.gap_algorithm_version,
           current_mastery_level = EXCLUDED.current_mastery_level,
           current_state_label = EXCLUDED.current_state_label,
           target_mastery_level = EXCLUDED.target_mastery_level,
           target_state_label = EXCLUDED.target_state_label,
           gap_status = EXCLUDED.gap_status,
           gap_magnitude = EXCLUDED.gap_magnitude,
           severity = EXCLUDED.severity,
           priority_score = EXCLUDED.priority_score,
           priority_rank = EXCLUDED.priority_rank,
           confidence = EXCLUDED.confidence,
           confidence_factors = EXCLUDED.confidence_factors,
           trend = EXCLUDED.trend,
           consistency = EXCLUDED.consistency,
           closure_state = EXCLUDED.closure_state,
           closure_reason = EXCLUDED.closure_reason,
           is_root_gap = EXCLUDED.is_root_gap,
           dependency_annotation = EXCLUDED.dependency_annotation,
           evidence_summary = EXCLUDED.evidence_summary,
           explanation = EXCLUDED.explanation,
           ai_explanation = EXCLUDED.ai_explanation,
           calculated_at = EXCLUDED.calculated_at,
           updated_at = now()`,
        [
          snapshot.organizationId,
          snapshot.studentId,
          snapshot.roleId,
          snapshot.roleModelVersion,
          snapshot.gapAlgorithmVersion,
          snapshot.skillId,
          snapshot.skillName,
          snapshot.importance,
          snapshot.currentState.masteryLevel,
          snapshot.currentState.label,
          snapshot.targetState.masteryLevel,
          snapshot.targetState.label,
          snapshot.gapStatus,
          snapshot.gapMagnitude,
          snapshot.severity,
          snapshot.priorityScore,
          snapshot.priorityRank,
          snapshot.confidence,
          JSON.stringify(snapshot.confidenceFactors),
          snapshot.trend,
          JSON.stringify(snapshot.consistency),
          snapshot.closureState,
          snapshot.closureReason,
          snapshot.dependency.isRootGap,
          JSON.stringify(snapshot.dependency),
          JSON.stringify(snapshot.evidenceSummary),
          JSON.stringify(snapshot.explanation),
          snapshot.aiExplanation,
          snapshot.calculatedAt,
        ],
      );
    });
  }

  async recordHistory(entry: GapHistoryEntry): Promise<void> {
    await this.withTenantContext(entry.organizationId, async (client) => {
      await client.query(
        `INSERT INTO role_skill_gap_history (
           organization_id, student_id, role_id, skill_id,
           previous_gap_status, new_gap_status, previous_closure_state, new_closure_state,
           previous_severity, new_severity, change_reason, gap_algorithm_version,
           role_model_version, occurred_at
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
        [
          entry.organizationId,
          entry.studentId,
          entry.roleId,
          entry.skillId,
          entry.previousGapStatus,
          entry.newGapStatus,
          entry.previousClosureState,
          entry.newClosureState,
          entry.previousSeverity,
          entry.newSeverity,
          entry.changeReason,
          entry.gapAlgorithmVersion,
          entry.roleModelVersion,
          entry.occurredAt,
        ],
      );
    });
  }

  async listSnapshotsForRole(
    organizationId: string,
    studentId: string,
    roleId: string,
  ): Promise<PersistedGapSnapshot[]> {
    return this.withTenantContext(organizationId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM role_skill_gap_snapshots
         WHERE organization_id = $1 AND student_id = $2 AND role_id = $3
         ORDER BY priority_rank ASC NULLS LAST`,
        [organizationId, studentId, roleId],
      );
      return rows.map(rowToSnapshot);
    });
  }

  async getHistory(
    organizationId: string,
    studentId: string,
    roleId: string,
    skillId: string,
  ): Promise<GapHistoryEntry[]> {
    return this.withTenantContext(organizationId, async (client) => {
      const { rows } = await client.query(
        `SELECT * FROM role_skill_gap_history
         WHERE organization_id = $1 AND student_id = $2 AND role_id = $3 AND skill_id = $4
         ORDER BY occurred_at DESC`,
        [organizationId, studentId, roleId, skillId],
      );
      return rows.map(rowToHistoryEntry);
    });
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToSnapshot(row: any): PersistedGapSnapshot {
  return {
    studentId: row.student_id,
    organizationId: row.organization_id,
    roleId: row.role_id,
    roleModelVersion: row.role_model_version,
    gapAlgorithmVersion: row.gap_algorithm_version,
    skillId: row.skill_id,
    skillName: row.skill_name,
    importance: row.importance,
    currentState: { masteryLevel: row.current_mastery_level, label: row.current_state_label },
    targetState: { masteryLevel: row.target_mastery_level, label: row.target_state_label },
    gapStatus: row.gap_status,
    gapMagnitude: Number(row.gap_magnitude),
    severity: row.severity,
    priorityScore: Number(row.priority_score),
    priorityRank: row.priority_rank,
    confidence: Number(row.confidence),
    confidenceFactors: row.confidence_factors,
    trend: row.trend,
    consistency: row.consistency,
    closureState: row.closure_state,
    closureReason: row.closure_reason,
    evidenceSummary: row.evidence_summary,
    dependency: row.dependency_annotation,
    explanation: row.explanation,
    aiExplanation: row.ai_explanation,
    calculatedAt: row.calculated_at instanceof Date ? row.calculated_at.toISOString() : row.calculated_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function rowToHistoryEntry(row: any): GapHistoryEntry {
  return {
    id: row.id,
    organizationId: row.organization_id,
    studentId: row.student_id,
    roleId: row.role_id,
    skillId: row.skill_id,
    previousGapStatus: row.previous_gap_status,
    newGapStatus: row.new_gap_status,
    previousClosureState: row.previous_closure_state,
    newClosureState: row.new_closure_state,
    previousSeverity: row.previous_severity,
    newSeverity: row.new_severity,
    changeReason: row.change_reason,
    gapAlgorithmVersion: row.gap_algorithm_version,
    roleModelVersion: row.role_model_version,
    occurredAt: row.occurred_at instanceof Date ? row.occurred_at.toISOString() : row.occurred_at,
  };
}
