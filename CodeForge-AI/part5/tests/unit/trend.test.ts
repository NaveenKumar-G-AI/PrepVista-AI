import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeTrend } from '../../src/mastery/estimators.js';
import type { Evidence } from '../../src/types.js';

function evAt(rawScore: number, daysAgo: number): Evidence {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return {
    id: 'e', studentId: 's1', skillId: 'sk', attemptId: 'a', challengeId: `c${daysAgo}`, isPrimary: true,
    rawScore, difficultyScore: 3, independent: true, assistanceUsed: 'NONE', mistakeCategory: rawScore >= 1 ? 'NONE' : 'LOGIC_ERROR',
    languageIssue: false, contextType: 'STANDARD', createdAt: d.toISOString(),
  };
}

test('trend: fewer than minPointsRequired -> INSUFFICIENT_DATA', () => {
  assert.equal(computeTrend([]), 'INSUFFICIENT_DATA');
  assert.equal(computeTrend([evAt(1, 2), evAt(1, 1)]), 'INSUFFICIENT_DATA');
});

test('trend: the exact spec example 3/10, 5/10, 6/10, 8/10, 9/10 -> IMPROVING', () => {
  const evidence = [evAt(0.3, 5), evAt(0.5, 4), evAt(0.6, 3), evAt(0.8, 2), evAt(0.9, 1)];
  assert.equal(computeTrend(evidence), 'IMPROVING');
});

test('trend: declining scores -> DECLINING', () => {
  const evidence = [evAt(0.9, 5), evAt(0.8, 4), evAt(0.6, 3), evAt(0.5, 2), evAt(0.3, 1)];
  assert.equal(computeTrend(evidence), 'DECLINING');
});

test('trend: flat scores -> STABLE', () => {
  const evidence = [evAt(0.7, 5), evAt(0.72, 4), evAt(0.68, 3), evAt(0.71, 2), evAt(0.69, 1)];
  assert.equal(computeTrend(evidence), 'STABLE');
});

test('trend: bouncing scores with no clear direction -> INCONSISTENT', () => {
  const evidence = [evAt(0.9, 5), evAt(0.1, 4), evAt(0.85, 3), evAt(0.15, 2), evAt(0.8, 1)];
  assert.equal(computeTrend(evidence), 'INCONSISTENT');
});

test('trend: a single bad attempt does not by itself determine a trend (needs minPointsRequired)', () => {
  assert.equal(computeTrend([evAt(0, 1)]), 'INSUFFICIENT_DATA');
});
