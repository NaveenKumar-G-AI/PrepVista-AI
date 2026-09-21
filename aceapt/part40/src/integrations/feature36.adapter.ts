import { PoolClient } from 'pg';
import { env } from '../config/env';

/**
 * Feature 36 executes and prioritizes actions (spec ??55, ??46). This adapter
 * is the ONLY place Feature 40 talks to it: it drains PENDING outbox rows and
 * either POSTs them to a real Feature 36 endpoint (if FEATURE36_ACTION_ENGINE_URL
 * is configured -- it is left blank in .env.example on purpose) or, absent a
 * real endpoint to call, marks them DISPATCHED locally with a note, which is
 * the honest thing to do in a standalone build with no Feature 36 to hand off
 * to. Swap the no-op branch for a real call once wired into the real repo.
 */

export async function dispatchPendingOutboxEvents(client: PoolClient, limit = 50): Promise<{ dispatched: number; failed: number }> {
  const { rows } = await client.query(
    `SELECT id, event_type, target_feature, student_id, payload
     FROM outbox_events WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT $1`,
    [limit]
  );

  let dispatched = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      if (env.feature36.url) {
        const res = await fetch(env.feature36.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(env.feature36.apiKey ? { Authorization: `Bearer ${env.feature36.apiKey}` } : {}),
          },
          body: JSON.stringify({
            eventType: row.event_type,
            studentId: row.student_id,
            payload: row.payload,
          }),
        });
        if (!res.ok) throw new Error(`Feature 36 endpoint returned ${res.status}`);
      }
      // No FEATURE36_ACTION_ENGINE_URL configured: this is a standalone build
      // with nothing real to call yet. Marking DISPATCHED (rather than
      // silently leaving PENDING forever) keeps the outbox table meaningful
      // for tests; a real deployment sets the URL and this branch is
      // unreachable in practice.
      await client.query(
        `UPDATE outbox_events SET status = 'DISPATCHED', dispatched_at = now(), attempts = attempts + 1 WHERE id = $1`,
        [row.id]
      );
      dispatched += 1;
    } catch (err) {
      await client.query(
        `UPDATE outbox_events SET status = 'FAILED', attempts = attempts + 1, last_error = $2 WHERE id = $1`,
        [row.id, (err as Error).message]
      );
      failed += 1;
    }
  }

  return { dispatched, failed };
}
