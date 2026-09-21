#!/usr/bin/env node
/**
 * ACEAPT ALIGN — golden-scenario demo walkthrough (spec §63, §72 E2E).
 *
 * Replays the spec's own Startupthon demo end to end over real HTTP
 * against a running instance of this service: capability DNA -> targets
 * -> why -> fit/readiness -> what-if -> improve (ADAPT) -> prove (PROOF)
 * -> verified -> alignment updated.
 *
 * Requires: the server running (npm run dev / npm start), Postgres
 * migrated + seeded, and ALIGN_SERVICE_JWT_SECRET set to the same value
 * the server is using.
 *
 * Usage: BASE_URL=http://localhost:4029 ALIGN_SERVICE_JWT_SECRET=... node scripts/demo-walkthrough.js
 */
const { Pool } = require('pg');
const { signHmacJwt } = require('../dist/api/middleware/auth');

const BASE_URL = process.env.BASE_URL || 'http://localhost:4029';
const SECRET = process.env.ALIGN_SERVICE_JWT_SECRET;
const STUDENT_ID = 'demo-anika';
const TARGET_ID = 'data_analyst';

if (!SECRET) {
  console.error('ALIGN_SERVICE_JWT_SECRET must be set.');
  process.exit(1);
}

let checks = 0;
let failures = 0;
function check(label, condition) {
  checks += 1;
  if (condition) {
    console.log(`  \u2713 ${label}`);
  } else {
    failures += 1;
    console.log(`  \u2717 ${label}`);
  }
}

function studentToken() {
  return signHmacJwt({ sub: STUDENT_ID, role: 'student', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
}
function tpoToken() {
  return signHmacJwt({ sub: 'tpo-staff-1', role: 'tpo', exp: Math.floor(Date.now() / 1000) + 3600 }, SECRET);
}

async function call(path, opts = {}, token = studentToken()) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => null);
  return { status: res.status, body };
}

async function withServiceContext(pool, fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'service', true)");
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } finally {
    client.release();
  }
}

/** Evidence enters ALIGN from elsewhere in ACEAPT — seed it directly, not through this module's own API. */
async function seedDemoEvidence(pool) {
  const client = await pool.connect();
  const NOW = Date.now();
  const daysAgo = (d) => new Date(NOW - d * 86400000).toISOString();

  function events(capabilityId, performances, difficulties) {
    return performances.map((performance, i) => ({
      capabilityId,
      performance,
      occurredAt: daysAgo(2 + i * 4),
      difficulty: difficulties[i],
      novelty: 0.55,
      timed: true,
      proofVerified: false,
    }));
  }

  const dataset = [
    ...events('quant_reasoning', [0.82, 0.85, 0.8, 0.88, 0.83], [0.4, 0.5, 0.6, 0.7, 0.8]),
    ...events('data_interpretation', [0.85, 0.87, 0.83, 0.9, 0.86], [0.4, 0.5, 0.6, 0.7, 0.8]),
    ...events('logical_reasoning', [0.8, 0.82, 0.78, 0.85, 0.81], [0.4, 0.5, 0.6, 0.7, 0.8]),
    ...events('communication', [0.62, 0.65, 0.6, 0.58, 0.63], [0.4, 0.5, 0.6, 0.7, 0.8]),
    ...events('programming', [0.6, 0.58, 0.62, 0.55, 0.61], [0.4, 0.5, 0.6, 0.7, 0.8]),
    ...events('pattern_recognition', [0.6, 0.63, 0.58, 0.61, 0.59], [0.4, 0.5, 0.6, 0.7, 0.8]),
    ...events('technical_fundamentals', [0.25, 0.28, 0.22, 0.3, 0.24], [0.3, 0.4, 0.4, 0.5, 0.4]),
  ];

  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.actor_role', 'service', true)");
    await client.query('DELETE FROM capability_evidence_events WHERE student_id = $1', [STUDENT_ID]);
    for (const e of dataset) {
      await client.query(
        `INSERT INTO capability_evidence_events
           (student_id, capability_id, performance, occurred_at, difficulty, novelty, timed, proof_verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [STUDENT_ID, e.capabilityId, e.performance, e.occurredAt, e.difficulty, e.novelty, e.timed, e.proofVerified],
      );
    }
    await client.query('COMMIT');
  } finally {
    client.release();
  }
}

async function main() {
  console.log(`\nACEAPT ALIGN — golden scenario demo walkthrough\nstudent: ${STUDENT_ID}  target: ${TARGET_ID}\n`);

  const health = await fetch(`${BASE_URL}/health`).then((r) => r.json());
  check('server is up', health.ok === true);

  const pool = new Pool();
  console.log('\n[DEMO 1] Capability DNA — seeding evidence (as if produced by Feature 3/5/6/8/20)...');
  await seedDemoEvidence(pool);
  check('demo evidence seeded', true);

  console.log('\n[DEMO 2] Targets — recalculating and viewing the dashboard shortlist...');
  const recalced = await call('/align/recalculate', { method: 'POST' });
  check('recalculate succeeded', recalced.status === 200);
  check('recalculated all 7 seeded targets', recalced.body.results.length === 7);

  const dashboard = await call('/align');
  check('dashboard responded 200', dashboard.status === 200);
  const shortlistEntry = dashboard.body.shortlist.find((s) => s.targetId === TARGET_ID);
  check('Data Analyst appears in the priority shortlist', Boolean(shortlistEntry));
  console.log(
    `  shortlist: ${dashboard.body.shortlist.map((s) => `${s.targetName} (${s.tier}, fit ${s.fitScore}%)`).join(', ')}`,
  );

  console.log('\n[DEMO 3/4] Why Data Analyst? Fit vs Readiness...');
  const detailBefore = await call(`/align/targets/${TARGET_ID}`);
  check('target detail responded 200', detailBefore.status === 200);
  const before = detailBefore.body.result;
  check('fitScore is a real number, not fabricated', typeof before.fitScore === 'number');
  check('readinessScore is a real number', typeof before.readinessScore === 'number');
  check(
    'fit and readiness are genuinely different numbers (spec §16)',
    before.fitScore !== before.readinessScore,
  );
  check(
    'fit >= readiness before verification (nothing proof-verified yet)',
    before.fitScore >= before.readinessScore,
  );
  const gapNames = [...before.criticalGaps, ...before.supportingGaps].map((g) => g.capabilityId);
  check('Technical Fundamentals correctly identified as the gap', gapNames.includes('technical_fundamentals'));
  check(
    'Technical Fundamentals is NOT critical (IMPORTANT tier, doesn\u2019t cap fit the way a CORE gap would)',
    !before.criticalGaps.some((g) => g.capabilityId === 'technical_fundamentals'),
  );
  check('critical CORE requirements (quant + data interpretation) are met', before.criticalGaps.length === 0);
  check('explanation text was generated', typeof detailBefore.body.explanation.text === 'string' && detailBefore.body.explanation.text.length > 0);
  console.log(`  Fit ${before.fitScore}% | Readiness ${before.readinessScore}% | state ${before.state}`);
  console.log(`  explanation (${detailBefore.body.explanation.source}): "${detailBefore.body.explanation.text}"`);

  console.log('\n[DEMO 5] What if I improve Technical Fundamentals to STRONG?...');
  const scenario = await call('/align/scenario', {
    method: 'POST',
    body: JSON.stringify({ targetId: TARGET_ID, capabilityId: 'technical_fundamentals', projectedLevel: 'STRONG' }),
  });
  check('scenario call succeeded', scenario.status === 200);
  check('projection is labeled PROJECTED, never presented as actual', scenario.body.result.label === 'PROJECTED');
  check(
    'projected fit is at least as high as current fit',
    scenario.body.result.projectedFitScore >= scenario.body.result.currentFitScore,
  );
  console.log(
    `  Fit ${scenario.body.result.currentFitScore}% \u2192 ${scenario.body.result.projectedFitScore}% (projected)`,
  );

  console.log('\n[DEMO 6] Improve this gap \u2192 ADAPT (Feature 26)...');
  const improve = await call(`/align/targets/${TARGET_ID}/improve-gap`, {
    method: 'POST',
    body: JSON.stringify({ capabilityId: 'technical_fundamentals' }),
  });
  check('improve-gap accepted (202)', improve.status === 202);
  const adaptOutbox = await withServiceContext(pool, (client) =>
    client.query(
      `SELECT * FROM align_outbox WHERE event_type = 'GapIdentifiedForAdapt' AND student_id = $1 ORDER BY id DESC LIMIT 1`,
      [STUDENT_ID],
    ),
  );
  check('a GapIdentifiedForAdapt signal landed durably in the outbox', adaptOutbox.rowCount === 1);
  check(
    'the outbox payload names the right capability',
    adaptOutbox.rows[0]?.payload?.capabilityId === 'technical_fundamentals',
  );

  console.log('\n[DEMO 7] Prove this target \u2192 PROOF (Feature 28)...');
  const prove = await call(`/align/targets/${TARGET_ID}/prove`, { method: 'POST' });
  check('prove accepted (202)', prove.status === 202);
  const proofOutbox = await withServiceContext(pool, (client) =>
    client.query(
      `SELECT * FROM align_outbox WHERE event_type = 'TargetSelectedForProof' AND student_id = $1 ORDER BY id DESC LIMIT 1`,
      [STUDENT_ID],
    ),
  );
  check('a TargetSelectedForProof signal landed durably in the outbox', proofOutbox.rowCount === 1);

  console.log('\n[DEMO 8] PROOF completes and verifies Technical Fundamentals \u2192 ALIGN recalculates...');
  const webhook = await call('/align/webhooks/proof-completed', {
    method: 'POST',
    body: JSON.stringify({ studentId: STUDENT_ID, capabilityId: 'technical_fundamentals', verified: true }),
  });
  check('proof-completed webhook accepted', webhook.status === 200);

  const detailAfter = await call(`/align/targets/${TARGET_ID}`);
  const after = detailAfter.body.result;
  check('readiness increased after verification', after.readinessScore > before.readinessScore);
  console.log(
    `  Fit ${after.fitScore}% | Readiness ${before.readinessScore}% \u2192 ${after.readinessScore}% | state ${after.state}`,
  );

  console.log('\n[History] Alignment snapshots accumulated across the loop...');
  const history = await call(`/align/history?targetId=${TARGET_ID}`);
  check(
    '2 snapshots recorded (initial recalculate + webhook-triggered recalculate; cached reads correctly add none)',
    history.body.history.length === 2,
  );
  check(
    'the history shows readiness actually rising across those two snapshots',
    history.body.history[1].readinessScore > history.body.history[0].readinessScore,
  );

  console.log('\n[TPO] Cohort aggregate view...');
  const cohort = await call('/align/tpo/cohort', {}, tpoToken());
  check('tpo cohort view responded 200', cohort.status === 200);
  check(
    'Data Analyst appears in the cohort aggregate',
    cohort.body.targets.some((t) => t.targetId === TARGET_ID),
  );

  console.log('\n[Security] a student token cannot read another student\u2019s data...');
  const forbidden = await call(`/align/students/someone-else/targets/${TARGET_ID}`);
  check('cross-student access rejected with 403', forbidden.status === 403);

  await pool.end();

  console.log(`\n${checks - failures}/${checks} checks passed.\n`);
  process.exitCode = failures > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error('demo walkthrough crashed:', err);
  process.exit(1);
});
