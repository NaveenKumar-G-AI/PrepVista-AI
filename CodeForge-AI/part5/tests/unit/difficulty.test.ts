import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideDifficulty, detectFatigueSignal } from '../../src/difficulty/difficultyEngine.js';
import type { Evidence } from '../../src/types.js';

function ev(rawScore: number, i: number): Evidence {
  return {
    id: `e${i}`, studentId: 's1', skillId: 'sk', attemptId: `a${i}`, challengeId: `c${i}`, isPrimary: true,
    rawScore, difficultyScore: 3, independent: true, assistanceUsed: 'NONE', mistakeCategory: rawScore >= 1 ? 'NONE' : 'LOGIC_ERROR',
    languageIssue: false, contextType: 'STANDARD', createdAt: new Date(Date.now() + i * 1000).toISOString(),
  };
}

test('difficulty: no evidence -> hold at EASY', () => {
  const d = decideDifficulty([], 'EASY');
  assert.equal(d.mode, 'HOLD');
  assert.equal(d.targetLevel, 'EASY');
});

test('difficulty: consecutive independent successes -> ADVANCE to the next level', () => {
  const evidence = [ev(1, 0), ev(1, 1)];
  const d = decideDifficulty(evidence, 'EASY');
  assert.equal(d.mode, 'ADVANCE');
  assert.equal(d.targetLevel, 'MEDIUM');
});

test('difficulty: consecutive failures -> RECOVER a level down, not continued escalation (Phase 17)', () => {
  const evidence = [ev(0.2, 0), ev(0.1, 1)];
  const d = decideDifficulty(evidence, 'HARD');
  assert.equal(d.mode, 'RECOVER');
  assert.equal(d.targetLevel, 'MEDIUM');
});

test('difficulty: repeated failure at ADVANCED steps back through HARD, not further up', () => {
  const evidence = [ev(0, 0), ev(0, 1), ev(0, 2)];
  const d = decideDifficulty(evidence, 'ADVANCED');
  assert.equal(d.mode, 'RECOVER');
  assert.equal(d.targetLevel, 'HARD');
});

test('difficulty: mixed/inconclusive recent performance -> HOLD', () => {
  const evidence = [ev(1, 0), ev(0, 1)];
  const d = decideDifficulty(evidence, 'MEDIUM');
  assert.equal(d.mode, 'HOLD');
  assert.equal(d.targetLevel, 'MEDIUM');
});

test('difficulty: recovering from EASY floors at EASY (no negative level)', () => {
  const evidence = [ev(0, 0), ev(0, 1)];
  const d = decideDifficulty(evidence, 'EASY');
  assert.equal(d.mode, 'RECOVER');
  assert.equal(d.targetLevel, 'EASY');
});

test('fatigue: repeated recent failures with a long attempt -> signal fires', () => {
  const evidence = [ev(0, 0), ev(0.3, 1), ev(0, 2), ev(0.2, 3)];
  const result = detectFatigueSignal(evidence, [30000, 50000, 300000, 20000]);
  assert.ok(result.signal);
});

test('fatigue: solid recent performance -> no signal', () => {
  const evidence = [ev(1, 0), ev(1, 1), ev(0.9, 2), ev(1, 3)];
  const result = detectFatigueSignal(evidence, [30000, 30000, 30000, 30000]);
  assert.equal(result.signal, false);
});
