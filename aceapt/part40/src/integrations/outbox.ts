import { PoolClient } from 'pg';

/**
 * Feature 40 CREATES strategic actions; Feature 36 EXECUTES/prioritizes them
 * (spec ??55 -- "Do not create competing task engines"). The outbox pattern
 * makes that handoff durable: the event row is written in the SAME
 * transaction as the Feature 40 data that triggered it, so a crash between
 * "decide the action" and "tell Feature 36" can never silently drop the
 * event -- a dispatcher can always find PENDING rows and retry.
 */

export type OutboxEventType =
  | 'FEATURE40.FUTURE_GAP.CRITICAL_OPENED'
  | 'FEATURE40.STRATEGIC_ACTION.CREATED'
  | 'FEATURE40.CAREER_EXPERIMENT.COMPLETED';

export async function writeOutboxEvent(
  client: PoolClient,
  event: {
    eventType: OutboxEventType;
    targetFeature: string;
    studentId: string | null;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO outbox_events (event_type, target_feature, student_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [event.eventType, event.targetFeature, event.studentId, JSON.stringify(event.payload)]
  );
}
