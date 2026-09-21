import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shouldTargetRepetition } from '../../src/recommendation/repetitionControl.js';
import type { Evidence } from '../../src/types.js';

function ev(mistake: Evidence['mistakeCategory'], challengeId: string, i: number): Evidence {
  return {
    id: `e${i}`, studentId: 's1', skillId: 'sk', attemptId: `a${i}`, challengeId, isPrimary: true,
    rawScore: mistake === 'NONE' ? 1 : 0.4, difficultyScore: 3, independent: true, assistanceUsed: 'NONE',
    mistakeCategory: mistake, languageIssue: false, contextType: 'STANDARD', createdAt: new Date(Date.now() + i * 1000).toISOString(),
  };
}

test('repetition: the exact same mistake three times in a row -> target repetition on that challenge (Phase 23 exact scenario)', () => {
  const evidence = [ev('STATE_MANAGEMENT_ERROR', 'c1', 0), ev('STATE_MANAGEMENT_ERROR', 'c1', 1), ev('STATE_MANAGEMENT_ERROR', 'c1', 2)];
  const result = shouldTargetRepetition(evidence);
  assert.ok(result.target);
  assert.equal(result.mistakeCategory, 'STATE_MANAGEMENT_ERROR');
  assert.equal(result.lastChallengeId, 'c1');
});

test('repetition: varied mistakes -> no targeted repetition (nothing specific is recurring)', () => {
  const evidence = [ev('BOUNDARY_CONDITION', 'c1', 0), ev('COMPLEXITY_ISSUE', 'c2', 1), ev('NONE', 'c3', 2)];
  const result = shouldTargetRepetition(evidence);
  assert.equal(result.target, false);
});

test('repetition: a single failure does not trigger targeted repetition (needs a recurring pattern)', () => {
  const evidence = [ev('NONE', 'c1', 0), ev('LOGIC_ERROR', 'c2', 1)];
  const result = shouldTargetRepetition(evidence);
  assert.equal(result.target, false);
});

test('repetition: success after failure breaks the pattern', () => {
  const evidence = [ev('LOGIC_ERROR', 'c1', 0), ev('LOGIC_ERROR', 'c2', 1), ev('NONE', 'c3', 2), ev('NONE', 'c4', 3)];
  const result = shouldTargetRepetition(evidence);
  assert.equal(result.target, false);
});
