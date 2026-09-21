import type { PoolClient } from "pg";
import type { StructuredSignal } from "../types/index.js";

export interface OutboxRow {
  id: string;
  targetFeature: string;
  studentId: string;
  skillId: string;
  signal: string;
  severity: string | null;
  confidence: number | null;
  payload: Record<string, unknown>;
  deliveredAt: string | null;
  deliveryError: string | null;
  createdAt: string;
}

function mapRow(r: any): OutboxRow {
  return {
    id: r.id,
    targetFeature: r.target_feature,
    studentId: r.student_id,
    skillId: r.skill_id,
    signal: r.signal,
    severity: r.severity,
    confidence: r.confidence === null ? null : Number(r.confidence),
    payload: r.payload,
    deliveredAt: r.delivered_at,
    deliveryError: r.delivery_error,
    createdAt: r.created_at,
  };
}

export async function enqueueSignal(
  client: PoolClient,
  input: { id: string; targetFeature: string; signal: StructuredSignal }
): Promise<OutboxRow> {
  const { rows } = await client.query(
    `INSERT INTO signal_outbox (id, target_feature, student_id, skill_id, signal, severity, confidence, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
    [
      input.id,
      input.targetFeature,
      input.signal.studentId,
      input.signal.skillId,
      input.signal.signal,
      input.signal.severity,
      input.signal.confidence,
      JSON.stringify(input.signal.evidence),
    ]
  );
  return mapRow(rows[0]);
}

export async function markDelivered(client: PoolClient, id: string, error: string | null): Promise<void> {
  await client.query(
    `UPDATE signal_outbox SET delivered_at = now(), delivery_error = $2 WHERE id = $1`,
    [id, error]
  );
}

export async function listUndelivered(client: PoolClient, limit = 50): Promise<OutboxRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM signal_outbox WHERE delivered_at IS NULL ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  return rows.map(mapRow);
}

export async function listRecentForStudent(client: PoolClient, studentId: string, limit = 20): Promise<OutboxRow[]> {
  const { rows } = await client.query(
    `SELECT * FROM signal_outbox WHERE student_id = $1 ORDER BY created_at DESC LIMIT $2`,
    [studentId, limit]
  );
  return rows.map(mapRow);
}
