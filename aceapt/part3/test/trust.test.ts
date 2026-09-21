import { test } from 'node:test';
import assert from 'node:assert/strict';
import { detectContradiction, computeFreshness, adjustEvidenceStrengthForContradiction } from '../src/engine/trust.js';
import type { SkillEvidence } from '../src/domain/types.js';

function evAt(daysAgoN: number, correct: boolean, sessionId: string): SkillEvidence {
  return {
    id: Math.random().toString(36),
    studentId: 's',
    skillId: 'sk',
    role: 'primary_skill',
    questionId: 'q',
    questionAttemptId: Math.random().toString(36),
    correct,
    difficulty: 3,
    cognitiveLevel: 'application',
    timeTakenMs: 1000,
    expectedTimeMs: 1000,
    source: 'practice',
    sessionId,
    createdAt: new Date(Date.now() - daysAgoN * 86_400_000).toISOString(),
  };
}

test('contradiction: one session all correct, another all incorrect', () => {
  const ev = [evAt(20, true, 'a'), evAt(20, true, 'a'), evAt(6, false, 'b'), evAt(6, false, 'b')];
  assert.equal(detectContradiction(ev), true);
});

test('no contradiction: broadly consistent performance across sessions', () => {
  const ev = [evAt(20, true, 'a'), evAt(20, true, 'a'), evAt(6, true, 'b'), evAt(6, false, 'b')];
  assert.equal(detectContradiction(ev), false);
});

test('freshness degrades with age', () => {
  assert.equal(computeFreshness([evAt(2, true, 'a')]), 'FRESH');
  assert.equal(computeFreshness([evAt(15, true, 'a')]), 'RECENT');
  assert.equal(computeFreshness([evAt(30, true, 'a')]), 'AGING');
  assert.equal(computeFreshness([evAt(60, true, 'a')]), 'STALE');
});

test('no evidence at all is Unknown freshness, not Stale', () => {
  assert.equal(computeFreshness([]), 'UNKNOWN');
});

test('a contradiction dampens a HIGH tier down to MODERATE, but leaves LOW alone', () => {
  assert.equal(adjustEvidenceStrengthForContradiction('HIGH', true), 'MODERATE');
  assert.equal(adjustEvidenceStrengthForContradiction('HIGH', false), 'HIGH');
  assert.equal(adjustEvidenceStrengthForContradiction('LOW', true), 'LOW');
});
