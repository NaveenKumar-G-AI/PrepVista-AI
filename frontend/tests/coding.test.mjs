import test from 'node:test';
import assert from 'node:assert/strict';
import { loadTs } from './load-ts.mjs';

const { decodeDraft, draftKey } = loadTs('../src/modules/coding/drafts.ts');
test('coding drafts cannot collide across accounts or composite identifiers', () => {
  assert.notEqual(draftKey('a', 'problem'), draftKey('b', 'problem'));
  assert.notEqual(draftKey('a:b', 'c'), draftKey('a', 'b:c'));
  assert.notEqual(draftKey('local', 'problem'), 'codeforge.workspace.v1');
});
test('corrupt, incompatible and oversized recovery data is not accepted', () => {
  for (const raw of [null, '{', '{}', JSON.stringify({ version: 2, code: '', explanation: '', assisted: false }), JSON.stringify({ version: 1, code: 'x'.repeat(20001), explanation: '', assisted: false })]) {
    assert.equal(decodeDraft(raw), null);
  }
  const result = decodeDraft(JSON.stringify({ version: 1, code: 'return 0', explanation: 'check edges', assisted: false }));
  assert.equal(result.code, 'return 0');
  assert.equal(result.assisted, false); // UI/export keeps undeclared assistance UNKNOWN
});
test('logout clears coding recovery but leaves guest work and preferences intact', () => {
  const data = new Map([['pv_coding_draft_v1:a:c', '{}'], ['codeforge.workspace.v1', 'guest'], ['pv_theme', 'dark']]);
  const storage = { get length() { return data.size; }, key: index => [...data.keys()][index], removeItem: key => data.delete(key), getItem: key => data.get(key) ?? null };
  const { api } = loadTs('../src/lib/api.ts', { window: {}, sessionStorage: storage, localStorage: storage });
  api.clearTokens();
  assert.equal(data.has('pv_coding_draft_v1:a:c'), false);
  assert.equal(data.get('codeforge.workspace.v1'), 'guest');
  assert.equal(data.get('pv_theme'), 'dark');
});
