import { PoolClient } from 'pg';

/** Every meaningful lifecycle event gets logged here — the audit trail behind section 59 and the "why did X happen" explainability in section 74. */
export async function logEvent(
  client: PoolClient,
  assessmentId: string | null,
  eventType: string,
  payload: Record<string, unknown> = {}
) {
  await client.query(`INSERT INTO assessment_events (assessment_id, event_type, payload) VALUES ($1, $2, $3)`, [
    assessmentId,
    eventType,
    JSON.stringify(payload),
  ]);
}
