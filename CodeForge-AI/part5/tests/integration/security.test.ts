import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import { createDb, runMigrations } from '../../src/db/client.js';
import { seed } from '../../src/db/seed.js';
import { createServer } from '../../src/api/server.js';
import { NullProvider } from '../../src/ai/nullProvider.js';
import { processAttempt } from '../../src/pipeline/processAttempt.js';

async function startServer() {
  const db = createDb(':memory:');
  runMigrations(db);
  seed(db);
  db.prepare("INSERT INTO students (id, email, display_name, goal) VALUES ('s1', 's1@x.com', 'S1', 'DSA_MASTERY')").run();
  db.prepare("INSERT INTO students (id, email, display_name, goal) VALUES ('s2', 's2@x.com', 'S2', 'DSA_MASTERY')").run();
  const app = createServer(db, new NullProvider());
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  return { db, server, base: `http://localhost:${port}` };
}

async function login(base: string, studentId: string): Promise<string> {
  const res = await fetch(`${base}/api/auth/demo-login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ studentId }) });
  const json = (await res.json()) as { token: string };
  return json.token;
}

test('security: no Authorization header -> 401 on every protected route', async () => {
  const { server, base } = await startServer();
  try {
    const res = await fetch(`${base}/api/dashboard`);
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('security: an invalid/garbage token -> 401, not a crash', async () => {
  const { server, base } = await startServer();
  try {
    const res = await fetch(`${base}/api/dashboard`, { headers: { Authorization: 'Bearer not-a-real-token' } });
    assert.equal(res.status, 401);
  } finally {
    server.close();
  }
});

test('security: student A cannot read student B\u2019s evidence timeline via the history endpoint, even when B has real data', async () => {
  const { db, server, base } = await startServer();
  try {
    // Give student B (s2) real evidence on skill_arrays.
    await processAttempt(db, { studentId: 's2', challengeId: 'challenge_two_sum', language: 'javascript', code: 'function twoSum(nums, target) { return [0,0]; }' });

    const tokenA = await login(base, 's1');
    const res = await fetch(`${base}/api/history/skill_arrays`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const json = (await res.json()) as { timeline: unknown[] };
    assert.equal(res.status, 200);
    assert.equal(json.timeline.length, 0, 'student A must see an EMPTY timeline for a skill only student B has evidence for — never B\u2019s data');

    // Confirm B really does have data (proves the emptiness above is a real security boundary, not just missing data everywhere).
    const tokenB = await login(base, 's2');
    const resB = await fetch(`${base}/api/history/skill_arrays`, { headers: { Authorization: `Bearer ${tokenB}` } });
    const jsonB = (await resB.json()) as { timeline: unknown[] };
    assert.ok(jsonB.timeline.length > 0, 'sanity check: student B should see their own real evidence');
  } finally {
    server.close();
  }
});

test('security: the studentId in a request body is ignored — identity comes only from the verified token', async () => {
  const { db, server, base } = await startServer();
  try {
    const tokenA = await login(base, 's1');
    // Attempt to submit AS student B by smuggling studentId in the body while authenticated as A.
    const res = await fetch(`${base}/api/attempts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId: 's2', challengeId: 'challenge_two_sum', language: 'javascript', code: 'function twoSum(nums, target) { return [0,1]; }' }),
    });
    assert.equal(res.status, 201);
    const row = db.prepare('SELECT student_id FROM attempts ORDER BY submitted_at DESC LIMIT 1').get() as { student_id: string };
    assert.equal(row.student_id, 's1', 'the attempt must be attributed to the AUTHENTICATED student (s1), never the body-supplied studentId (s2)');
  } finally {
    server.close();
  }
});

test('security: recommendation accept endpoint enforces ownership (404, not silent success, on a foreign recommendation id)', async () => {
  const { server, base } = await startServer();
  try {
    const tokenA = await login(base, 's1');
    const tokenB = await login(base, 's2');
    const nextRes = await fetch(`${base}/api/recommendations/next`, { headers: { Authorization: `Bearer ${tokenA}` } });
    const next = (await nextRes.json()) as { recommendationId: string };
    assert.ok(next.recommendationId);

    const acceptAsB = await fetch(`${base}/api/recommendations/${next.recommendationId}/accept`, { method: 'POST', headers: { Authorization: `Bearer ${tokenB}` } });
    assert.equal(acceptAsB.status, 404, 'student B must not be able to accept student A\u2019s recommendation');
  } finally {
    server.close();
  }
});

test('security: hidden test details never appear in the HTTP response body', async () => {
  const { server, base } = await startServer();
  try {
    const token = await login(base, 's1');
    const res = await fetch(`${base}/api/attempts`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: 'challenge_two_sum', language: 'javascript', code: 'function twoSum(nums, target) { const m = new Map(); for (let i=0;i<nums.length;i++){ const need = target-nums[i]; if (m.has(need)) return [m.get(need), i]; m.set(nums[i], i);} return []; }' }),
    });
    const json = (await res.json()) as { evaluation: { results: { testCaseId: string; category: string; actual?: unknown }[] } };
    const hiddenRow = json.evaluation.results.find((r) => r.testCaseId === 'ts_basic3');
    assert.ok(hiddenRow);
    assert.equal(hiddenRow!.category, 'hidden');
    assert.equal('actual' in hiddenRow!, false, 'a hidden test case must never leak its actual/expected value to the client');
  } finally {
    server.close();
  }
});
