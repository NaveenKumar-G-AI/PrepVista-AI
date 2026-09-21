import { test, describe } from 'node:test';
import assert from 'node:assert/strict';

import { runQualityGate } from '../services/questionQualityService';
import { validateBlueprint, applyFocusOverride } from '../services/blueprintService';
import { BLUEPRINTS, getBlueprint } from '../config/blueprints';
import { computeEndsAt, remainingSeconds, isExpired } from '../services/timerService';
import { scoreToState, DIMENSION_WEIGHTS } from '../config/readinessModel';

describe('questionQualityService', () => {
  const base = {
    id: 'q1',
    domain: 'QUANTITATIVE' as const,
    topic: 'ARITHMETIC' as const,
    skill: 'percentages',
    difficulty: 'EASY' as const,
    prompt: 'What is 10% of 100?',
    options: [
      { id: 'A', text: '5' },
      { id: 'B', text: '10' },
      { id: 'C', text: '15' },
      { id: 'D', text: '20' },
    ],
    correctOptionId: 'B',
    explanation: '10% of 100 is 10.',
    expectedTimeSeconds: 45,
  };

  test('a well-formed question passes the quality gate', () => {
    const result = runQualityGate(base);
    assert.equal(result.passed, true);
    assert.equal(result.health, 'HEALTHY');
  });

  test('duplicate option text is rejected as an answer issue', () => {
    const bad = { ...base, options: [...base.options.slice(0, 3), { id: 'D', text: '10' }] };
    const result = runQualityGate(bad);
    assert.equal(result.passed, false);
    assert.equal(result.health, 'ANSWER_ISSUE');
  });

  test('correctOptionId not matching any option is rejected', () => {
    const bad = { ...base, correctOptionId: 'Z' };
    const result = runQualityGate(bad);
    assert.equal(result.passed, false);
    assert.equal(result.health, 'ANSWER_ISSUE');
  });

  test('missing explanation is rejected', () => {
    const bad = { ...base, explanation: '' };
    const result = runQualityGate(bad);
    assert.equal(result.passed, false);
    assert.equal(result.health, 'EXPLANATION_ISSUE');
  });
});

describe('blueprintService', () => {
  test('every built-in blueprint has topic weights summing to ~100 and difficulty summing to 1.0', () => {
    for (const type of Object.keys(BLUEPRINTS) as (keyof typeof BLUEPRINTS)[]) {
      assert.doesNotThrow(() => validateBlueprint(getBlueprint(type)), `blueprint ${type} should be valid`);
    }
  });

  test('applyFocusOverride redistributes weight toward the focus topic and still sums to 100', () => {
    const base = getBlueprint('PROGRESS_ASSESSMENT').topicWeights;
    const result = applyFocusOverride(base, ['ARITHMETIC'], 60);
    const arithmeticWeight = result.find((w) => w.topic === 'ARITHMETIC')!.weightPct;
    assert.ok(arithmeticWeight >= 55 && arithmeticWeight <= 65, `expected ~60, got ${arithmeticWeight}`);
    const total = result.reduce((s, w) => s + w.weightPct, 0);
    assert.ok(Math.abs(total - 100) < 0.5, `expected total ~100, got ${total}`);
  });

  test('applyFocusOverride is a no-op when no focus topics are given', () => {
    const base = getBlueprint('MIXED_APTITUDE_ASSESSMENT').topicWeights;
    const result = applyFocusOverride(base, [], 60);
    assert.deepEqual(result, base);
  });
});

describe('timerService', () => {
  test('computeEndsAt adds duration seconds to the start time', () => {
    const start = '2026-01-01T00:00:00.000Z';
    const ends = computeEndsAt(start, 600);
    assert.equal(ends, '2026-01-01T00:10:00.000Z');
  });

  test('remainingSeconds is 0 once status is terminal, regardless of endsAt', () => {
    const future = new Date(Date.now() + 100_000).toISOString();
    assert.equal(remainingSeconds({ endsAt: future, status: 'SUBMITTED' }), 0);
    assert.equal(remainingSeconds({ endsAt: future, status: 'COMPLETED' }), 0);
  });

  test('isExpired is true once endsAt is in the past for an IN_PROGRESS assessment', () => {
    const past = new Date(Date.now() - 1000).toISOString();
    assert.equal(isExpired({ endsAt: past, status: 'IN_PROGRESS' }), true);
    assert.equal(isExpired({ endsAt: past, status: 'SUBMITTED' }), false);
  });
});

describe('readinessModel config', () => {
  test('dimension weights sum to 1.0', () => {
    const total = Object.values(DIMENSION_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(total - 1) < 0.001, `weights sum to ${total}, expected 1.0`);
  });

  test('scoreToState maps boundary scores to the right band', () => {
    assert.equal(scoreToState(90), 'HIGHLY_READY');
    assert.equal(scoreToState(85), 'HIGHLY_READY');
    assert.equal(scoreToState(84), 'READY');
    assert.equal(scoreToState(65), 'APPROACHING_READY');
    assert.equal(scoreToState(39), 'NOT_READY');
    assert.equal(scoreToState(0), 'NOT_READY');
  });
});
