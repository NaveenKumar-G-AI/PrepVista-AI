import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pool, withRequestContext } from '../db/pool';

const hasDb = Boolean(process.env.PGDATABASE || process.env.DATABASE_URL);

test(
  'withRequestContext isolates students and resets between requests on the same pooled connection',
  { skip: !hasDb ? 'No PGDATABASE/DATABASE_URL configured — skipping live Postgres integration test' : false },
  async () => {
    await withRequestContext({ studentId: null, role: 'service' }, async (client) => {
      await client.query('DELETE FROM capability_evidence_events WHERE student_id LIKE $1', ['itest-%']);
      await client.query(
        `INSERT INTO capability_evidence_events
           (student_id, capability_id, performance, occurred_at, difficulty, novelty, timed, proof_verified)
         VALUES
           ('itest-alice', 'quant_reasoning', 0.9, now(), 0.6, 0.5, true, true),
           ('itest-bob',   'quant_reasoning', 0.4, now(), 0.6, 0.5, true, false)`,
      );
    });

    const aliceRows = await withRequestContext({ studentId: 'itest-alice', role: 'student' }, (client) =>
      client.query('SELECT student_id FROM capability_evidence_events').then((r) => r.rows),
    );
    assert.equal(aliceRows.length, 1);
    assert.equal(aliceRows[0].student_id, 'itest-alice');

    // Cross-student write must be rejected even though this is a fresh
    // transaction — the whole point of using set_config(..., true) instead
    // of a bare set_config is that nothing here should be able to leak.
    await assert.rejects(
      withRequestContext({ studentId: 'itest-alice', role: 'student' }, (client) =>
        client.query(
          `INSERT INTO capability_evidence_events
             (student_id, capability_id, performance, occurred_at, difficulty, novelty, timed, proof_verified)
           VALUES ('itest-bob', 'programming', 0.9, now(), 0.5, 0.5, true, true)`,
        ),
      ),
      /row-level security/i,
    );

    // Directly prove no leakage across two back-to-back contexts sharing
    // whatever connection the pool happens to hand out.
    const bobRows = await withRequestContext({ studentId: 'itest-bob', role: 'student' }, (client) =>
      client.query('SELECT student_id FROM capability_evidence_events').then((r) => r.rows),
    );
    assert.equal(bobRows.length, 1);
    assert.equal(bobRows[0].student_id, 'itest-bob');

    await withRequestContext({ studentId: null, role: 'service' }, (client) =>
      client.query('DELETE FROM capability_evidence_events WHERE student_id LIKE $1', ['itest-%']),
    );
    await pool.end();
  },
);
