import { PoolClient } from 'pg';
import { pool, withRequestContext } from '../db/pool';

export interface OutboxEvent {
  id: number;
  eventType: string;
  studentId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Writes a signal into the durable outbox in the SAME transaction as
 * whatever alignment write triggered it (pass that transaction's client).
 * This is the pattern already used for Feature 3/4/6/7 integration
 * elsewhere in ACEAPT: the write can never "succeed but forget to notify",
 * because both happen atomically or not at all.
 */
export async function publishSignal(
  client: PoolClient,
  eventType: string,
  studentId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await client.query(
    `INSERT INTO align_outbox (event_type, student_id, payload) VALUES ($1, $2, $3)`,
    [eventType, studentId, JSON.stringify(payload)],
  );
}

export type OutboxConsumer = (event: OutboxEvent) => Promise<void>;

const consumers = new Map<string, OutboxConsumer[]>();

/**
 * Register a real consumer for an event type — the seam where the real
 * Feature 26 (ADAPT) / Feature 28 (PROOF) integration plugs in once it
 * exists. Nothing is registered by default; until then, events sit
 * durably in align_outbox (nothing is lost — see docs/INTEGRATION.md).
 */
export function registerOutboxConsumer(eventType: string, consumer: OutboxConsumer): void {
  const list = consumers.get(eventType) ?? [];
  list.push(consumer);
  consumers.set(eventType, list);
}

/** Test-only escape hatch — production code should never need this. */
export function _clearOutboxConsumers(): void {
  consumers.clear();
}

const MAX_DISPATCH_ATTEMPTS = 5;
const BATCH_SIZE = 20;

/**
 * Polls undispatched events and hands them to registered consumers.
 * Only active when OUTBOX_DISPATCH_ENABLED=true (see .env.example) — call
 * this from a scheduled job/worker in the host app; it does not
 * self-schedule.
 *
 * Claims its batch with a single atomic UPDATE ... RETURNING (rather than
 * SELECT ... FOR UPDATE SKIP LOCKED followed by a separate release) so two
 * dispatcher runs can never both claim the same row — if you run more than
 * one worker process, this is what keeps them from double-processing.
 */
export async function dispatchPendingOutboxEvents(): Promise<{ dispatched: number; failed: number }> {
  if (process.env.OUTBOX_DISPATCH_ENABLED !== 'true') {
    return { dispatched: 0, failed: 0 };
  }

  const claimed = await withRequestContext({ studentId: null, role: 'service' }, (client) =>
    client.query(
      `UPDATE align_outbox
       SET dispatch_attempts = dispatch_attempts + 1
       WHERE id IN (
         SELECT id FROM align_outbox
         WHERE dispatched_at IS NULL AND dispatch_attempts < $1
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
       )
       RETURNING id, event_type, student_id, payload, created_at`,
      [MAX_DISPATCH_ATTEMPTS, BATCH_SIZE],
    ),
  );

  let dispatched = 0;
  let failed = 0;

  for (const row of claimed.rows) {
    const event: OutboxEvent = {
      id: row.id,
      eventType: row.event_type,
      studentId: row.student_id,
      payload: row.payload,
      createdAt: new Date(row.created_at).toISOString(),
    };
    const eventConsumers = consumers.get(event.eventType) ?? [];
    try {
      for (const consumer of eventConsumers) {
        await consumer(event);
      }
      await withRequestContext({ studentId: null, role: 'service' }, (client) =>
        client.query(`UPDATE align_outbox SET dispatched_at = now() WHERE id = $1`, [event.id]),
      );
      dispatched += 1;
    } catch (err) {
      failed += 1;
      await withRequestContext({ studentId: null, role: 'service' }, (client) =>
        client.query(`UPDATE align_outbox SET last_error = $2 WHERE id = $1`, [
          event.id,
          err instanceof Error ? err.message : String(err),
        ]),
      );
    }
  }

  return { dispatched, failed };
}
