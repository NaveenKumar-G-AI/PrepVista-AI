import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const { createAwakeProbe } = loadTs('../src/lib/backend-awake.ts');
test('heartbeat coalesces callers and caches one validated liveness response', async () => {
  let calls = 0;
  const probe = createAwakeProbe(async (url) => {
    calls++; assert.equal(url, 'https://api.example.invalid/health/awake');
    await new Promise(resolve => setTimeout(resolve, 5));
    return { ok: true, status: 200, json: async () => ({ status: 'awake', service: 'prepvista-backend' }) };
  });
  assert.ok((await Promise.all(Array.from({ length: 20 }, () => probe('https://api.example.invalid')))).every(r => r.ok));
  await probe('https://api.example.invalid'); assert.equal(calls, 1);
});
test('unrelated 200 responses cannot report backend awake', async () => {
  for (const payload of [{ status: 'ok' }, { status: 'awake', service: 'other' }, null]) {
    let calls = 0;
    const probe = createAwakeProbe(async () => { calls++; return { ok: true, status: 200, json: async () => payload }; });
    assert.equal((await probe('https://api.example.invalid')).ok, false); assert.equal(calls, 1);
  }
});
test('deadline aborts a slow backend without fallback calls', async () => {
  const probe = createAwakeProbe((_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout')))), 10);
  assert.equal((await probe('https://api.example.invalid')).ok, false);
  assert.equal((await probe('file:///private')).configured, false);
});
