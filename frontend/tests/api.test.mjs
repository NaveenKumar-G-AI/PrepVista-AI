import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
function setup(fetch) { return loadTs('../src/lib/api.ts', { fetch }).api; }
test('failed mutations are not automatically replayed', async () => {
  let calls = 0;
  const api = setup(async () => { calls++; return response({ detail: 'Down' }, 503); });
  await assert.rejects(api.request('/billing', { method: 'POST', body: {} }));
  assert.equal(calls, 1);
});
test('a 4xx GET error is not retried', async () => {
  let calls = 0;
  const api = setup(async () => { calls++; return response({ detail: 'Forbidden' }, 403); });
  await assert.rejects(api.request('/private'));
  assert.equal(calls, 1);
});
test('successful empty responses do not become failed writes', async () => {
  const api = setup(async () => new Response(null, { status: 204 }));
  assert.equal(await api.request('/record', { method: 'DELETE' }), undefined);
});
test('logout invalidates cached profile data', async () => {
  let calls = 0;
  const api = setup(async () => response({ user: ++calls }));
  assert.equal((await api.cachedRequest('/auth/me')).user, 1);
  api.clearTokens();
  assert.equal((await api.cachedRequest('/auth/me')).user, 2);
});
test('a late response cannot repopulate a previous account cache', async () => {
  let resolveOld;
  let calls = 0;
  const api = setup(() => ++calls === 1 ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve(response({ user: 'new' })));
  const old = api.cachedRequest('/auth/me');
  api.clearTokens();
  const fresh = await api.cachedRequest('/auth/me');
  resolveOld(response({ user: 'old' }));
  await old;
  assert.equal(fresh.user, 'new');
  assert.equal((await api.cachedRequest('/auth/me')).user, 'new');
});
test('refresh completing after logout cannot restore the old login', async () => {
  let finishRefresh;
  const api = setup(url => url.endsWith('/auth/refresh') ? new Promise(resolve => { finishRefresh = resolve; }) : Promise.resolve(response({ detail: 'Expired' }, 401)));
  api.setTokens('a.b.c', 'refresh-old');
  const request = api.request('/private', { retries: 0 });
  await new Promise(resolve => setImmediate(resolve));
  api.clearTokens();
  finishRefresh(response({ access_token: 'x.y.z', refresh_token: 'refresh-new' }));
  await assert.rejects(request);
  assert.equal(api.getToken(), null);
});
