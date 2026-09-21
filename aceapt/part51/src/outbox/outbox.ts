import type { PoolClient } from "pg";
import type { SignalType, SignalPayloadMap } from "./signalTypes.js";

type Queryable = Pick<PoolClient, "query">;

export interface OutboxRow {
  id: string;
  studentId: string;
  signalType: SignalType;
  payload: unknown;
  status: "PENDING" | "DISPATCHED" | "FAILED";
  createdAt: string;
  dispatchedAt: string | null;
}

/**
 * Writes a signal row in the SAME transaction as whatever state change
 * produced it (call this with the client already inside withStudentContext
 * or withServiceContext — never opens its own connection). That's what makes
 * this an "outbox": the signal can never be lost to a crash between "the
 * decision was made" and "the signal was recorded", because they're the same
 * commit.
 */
export async function writeSignal<T extends SignalType>(
  client: Queryable,
  studentId: string,
  signalType: T,
  payload: SignalPayloadMap[T]
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO signal_outbox (student_id, signal_type, payload) VALUES ($1, $2, $3::jsonb) RETURNING id`,
    [studentId, signalType, JSON.stringify(payload)]
  );
  return result.rows[0]!.id;
}

/** Consumers (a real F48/49/50/36/37/readiness service, or this repo's own relay) poll this. */
export async function fetchPendingSignals(client: Queryable, limit = 50): Promise<OutboxRow[]> {
  const result = await client.query(
    `SELECT id, student_id AS "studentId", signal_type AS "signalType", payload, status,
            created_at AS "createdAt", dispatched_at AS "dispatchedAt"
       FROM signal_outbox WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );
  return result.rows;
}

export async function markDispatched(client: Queryable, id: string): Promise<void> {
  await client.query(
    `UPDATE signal_outbox SET status = 'DISPATCHED', dispatched_at = now() WHERE id = $1`,
    [id]
  );
}

export async function markFailed(client: Queryable, id: string, error: string): Promise<void> {
  await client.query(
    `UPDATE signal_outbox SET status = 'FAILED', attempts = attempts + 1, last_error = $2 WHERE id = $1`,
    [id, error.slice(0, 500)]
  );
}
