import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, withRequestContext } from '../db/pool';
import { publishSignal, registerOutboxConsumer, dispatchPendingOutboxEvents, _clearOutboxConsumers, OutboxEvent } from '../integrations/outbox';

const hasDb = Boolean(process.env.PGDATABASE || process.env.DATABASE_URL);

test(
  'dispatchPendingOutboxEvents claims, delivers to consumers, and marks events dispatched — and correctly tracks a failing consumer',
  { skip: !hasDb ? 'No PGDATABASE/DATABASE_URL configured — skipping live Postgres integration test' : false },
  async () => {
    const originalFlag = process.env.OUTBOX_DISPATCH_ENABLED;
    process.env.OUTBOX_DISPATCH_ENABLED = 'true';
    _clearOutboxConsumers();

    const studentId = 'itest-outbox-student';
    const okEventType = 'ITestOutboxOk';
    const failEventType = 'ITestOutboxFail';

    try {
      await withRequestContext({ studentId: null, role: 'service' }, (client) =>
        client.query(`DELETE FROM align_outbox WHERE student_id = $1`, [studentId]),
      );

      const received: OutboxEvent[] = [];
      registerOutboxConsumer(okEventType, async (event) => {
        received.push(event);
      });
      registerOutboxConsumer(failEventType, async () => {
        throw new Error('simulated consumer failure');
      });

      await withRequestContext({ studentId, role: 'service' }, (client) =>
        publishSignal(client, okEventType, studentId, { hello: 'world' }),
      );
      await withRequestContext({ studentId, role: 'service' }, (client) =>
        publishSignal(client, failEventType, studentId, { will: 'fail' }),
      );

      const result = await dispatchPendingOutboxEvents();
      assert.equal(result.dispatched, 1, 'exactly the ok event should have dispatched');
      assert.equal(result.failed, 1, 'exactly the failing event should be counted as failed');
      assert.equal(received.length, 1);
      assert.deepEqual(received[0]?.payload, { hello: 'world' });

      const rows = await withRequestContext({ studentId: null, role: 'service' }, (client) =>
        client
          .query(
            `SELECT event_type, dispatched_at, dispatch_attempts, last_error FROM align_outbox WHERE student_id = $1 ORDER BY event_type`,
            [studentId],
          )
          .then((r) => r.rows),
      );

      const okRow = rows.find((r) => r.event_type === okEventType);
      const failRow = rows.find((r) => r.event_type === failEventType);
      assert.ok(okRow?.dispatched_at, 'the ok event must be marked dispatched');
      assert.equal(failRow?.dispatched_at, null, 'the failing event must NOT be marked dispatched');
      assert.equal(failRow?.dispatch_attempts, 1);
      assert.match(failRow?.last_error ?? '', /simulated consumer failure/);

      // A second dispatch pass should retry the failed one and leave the
      // already-dispatched one alone (it no longer matches WHERE dispatched_at IS NULL).
      const secondPass = await dispatchPendingOutboxEvents();
      assert.equal(secondPass.dispatched, 0);
      assert.equal(secondPass.failed, 1);
    } finally {
      await withRequestContext({ studentId: null, role: 'service' }, (client) =>
        client.query(`DELETE FROM align_outbox WHERE student_id = $1`, [studentId]),
      );
      _clearOutboxConsumers();
      if (originalFlag !== undefined) process.env.OUTBOX_DISPATCH_ENABLED = originalFlag;
      else delete process.env.OUTBOX_DISPATCH_ENABLED;
      await pool.end();
    }
  },
);
