import type { PoolClient } from "pg";
import type { AccuracyResult } from "../../types/accuracy.js";
import type { ErrorType, InterventionType, RecurrenceStatus } from "../../types/errorTaxonomy.js";

type Queryable = Pick<PoolClient, "query">;

export async function insertSnapshot(
  client: Queryable,
  studentId: string,
  result: AccuracyResult,
  reason: string
): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO accuracy_profile_snapshot
       (student_id, scope, scope_id, accuracy, independent_accuracy, timed_accuracy, novel_accuracy,
        sample_size, confidence, reason)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id`,
    [
      studentId,
      result.scope,
      result.scopeId,
      result.accuracy,
      result.independentAccuracy,
      result.timedAccuracy,
      result.novelAccuracy,
      result.sampleSize,
      result.confidence,
      reason
    ]
  );
  return r.rows[0]!.id;
}

export interface SnapshotRow {
  id: string;
  scope: string;
  scopeId: string | null;
  accuracy: number | null;
  independentAccuracy: number | null;
  timedAccuracy: number | null;
  novelAccuracy: number | null;
  sampleSize: number;
  confidence: string;
  reason: string | null;
  computedAt: string;
}

const SNAPSHOT_COLUMNS = `
  id, scope, scope_id AS "scopeId", accuracy, independent_accuracy AS "independentAccuracy",
  timed_accuracy AS "timedAccuracy", novel_accuracy AS "novelAccuracy", sample_size AS "sampleSize",
  confidence, reason, computed_at AS "computedAt"
`;

/** §110 "Accuracy Improvement: Baseline → current" — earliest snapshot for this scope. */
export async function getBaselineSnapshot(
  client: Queryable,
  studentId: string,
  scope: string,
  scopeId: string | null
): Promise<SnapshotRow | null> {
  const r = await client.query(
    `SELECT ${SNAPSHOT_COLUMNS} FROM accuracy_profile_snapshot
      WHERE student_id = $1 AND scope = $2 AND scope_id IS NOT DISTINCT FROM $3
      ORDER BY computed_at ASC LIMIT 1`,
    [studentId, scope, scopeId]
  );
  return r.rows[0] ?? null;
}

export async function getSnapshotHistory(
  client: Queryable,
  studentId: string,
  scope: string,
  scopeId: string | null,
  limit = 20
): Promise<SnapshotRow[]> {
  const r = await client.query(
    `SELECT ${SNAPSHOT_COLUMNS} FROM accuracy_profile_snapshot
      WHERE student_id = $1 AND scope = $2 AND scope_id IS NOT DISTINCT FROM $3
      ORDER BY computed_at ASC LIMIT $4`,
    [studentId, scope, scopeId, limit]
  );
  return r.rows;
}

export interface InsertInterventionInput {
  studentId: string;
  sessionId: string | null;
  errorType: ErrorType;
  skillId: string | null;
  interventionType: InterventionType;
  reason: string;
  recurrenceStatus: RecurrenceStatus;
  evidence: Record<string, unknown>;
}

export async function insertIntervention(client: Queryable, input: InsertInterventionInput): Promise<string> {
  const r = await client.query<{ id: string }>(
    `INSERT INTO accuracy_intervention
       (student_id, session_id, error_type, skill_id, intervention_type, reason, recurrence_status, evidence)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb) RETURNING id`,
    [
      input.studentId,
      input.sessionId,
      input.errorType,
      input.skillId,
      input.interventionType,
      input.reason,
      input.recurrenceStatus,
      JSON.stringify(input.evidence)
    ]
  );
  return r.rows[0]!.id;
}

export async function getRecentInterventions(client: Queryable, studentId: string, limit = 10) {
  const r = await client.query(
    `SELECT id, session_id AS "sessionId", error_type AS "errorType", skill_id AS "skillId",
            intervention_type AS "interventionType", reason, recurrence_status AS "recurrenceStatus",
            evidence, created_at AS "createdAt"
       FROM accuracy_intervention WHERE student_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [studentId, limit]
  );
  return r.rows;
}
