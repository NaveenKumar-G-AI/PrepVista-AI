import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import { createServer } from '../src/api/server.js';
import { repo } from '../src/store/repository.js';

let server: Server;
let base: string;

before(async () => {
  repo.load();
  const app = createServer();
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  base = `http://localhost:${port}`;
});

after(() => {
  server.close();
});

test('requesting your own profile succeeds', async () => {
  const res = await fetch(`${base}/api/profile/demo-student-1`, { headers: { 'x-student-id': 'demo-student-1' } });
  assert.equal(res.status, 200);
});

test("requesting another student's profile is forbidden, not just filtered", async () => {
  const res = await fetch(`${base}/api/profile/demo-student-1`, { headers: { 'x-student-id': 'demo-student-2' } });
  assert.equal(res.status, 403);
});

test('missing session header is unauthenticated', async () => {
  const res = await fetch(`${base}/api/profile/demo-student-1`);
  assert.equal(res.status, 401);
});

test('submitting the same evidence attempt twice is idempotent', async () => {
  const body = {
    skillId: 'skl_ratio',
    role: 'primary_skill',
    questionId: 'q999',
    questionAttemptId: 'idempotency-test-1',
    correct: true,
    difficulty: 2,
    cognitiveLevel: 'foundation',
    timeTakenMs: 1000,
    expectedTimeMs: 1000,
    source: 'practice',
    sessionId: 'sX',
  };
  const headers = { 'x-student-id': 'demo-student-1', 'Content-Type': 'application/json' };
  const first = await fetch(`${base}/api/evidence/demo-student-1`, { method: 'POST', headers, body: JSON.stringify(body) });
  const second = await fetch(`${base}/api/evidence/demo-student-1`, { method: 'POST', headers, body: JSON.stringify(body) });
  const firstJson = (await first.json()) as { accepted: boolean };
  const secondJson = (await second.json()) as { accepted: boolean };
  assert.equal(firstJson.accepted, true);
  assert.equal(secondJson.accepted, false);
});
