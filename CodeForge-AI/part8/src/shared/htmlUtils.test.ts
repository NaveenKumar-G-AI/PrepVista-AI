import { test } from 'node:test';
import assert from 'node:assert/strict';
import { escapeHtml } from './htmlUtils';

test('escapes script tags so student-authored text cannot inject markup', () => {
  const malicious = '<script>alert(1)</script>';
  const escaped = escapeHtml(malicious);
  assert.equal(escaped.includes('<script>'), false);
  assert.equal(escaped, '&lt;script&gt;alert(1)&lt;/script&gt;');
});

test('escapes quotes so attribute-breaking payloads are neutralized', () => {
  const malicious = `" onmouseover="alert(1)`;
  const escaped = escapeHtml(malicious);
  assert.equal(escaped.includes('"'), false);
});

test('escapes ampersands first so entities are not double-escaped', () => {
  assert.equal(escapeHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});
