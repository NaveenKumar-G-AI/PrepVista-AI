import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculateAlignment } from '../engine/alignmentEngine';
import { TARGET_PROFILES_SEED } from '../config/targetProfiles.seed';
import { makeDna, makeEntry } from './testHelpers';

const SOFTWARE_DEVELOPER = TARGET_PROFILES_SEED.find((t) => t.targetId === 'software_developer')!;

/**
 * Scenario A (spec §19's own example): programming WEAK against a target
 * that needs it CORE/STRONG, everything else met or exceeded, none
 * proof-verified yet.
 *
 * Hand-derived (see build notes / PR description for the full arithmetic):
 *   raw fit    = 3.682051 / 4.4  = 0.836830  -> 84 before the cap
 *   1 critical gap -> ceiling 0.55           -> fitScore = 55 (capped)
 *   raw readiness (all unverified, x0.45)    -> readinessScore = 38 (not capped by ceiling — the
 *                                                unverified discount alone already pulls it under 0.5)
 */
function scenarioA_oneCriticalGap() {
  return makeDna('student-a', [
    makeEntry('programming', 'WEAK'),
    makeEntry('problem_solving', 'STRONG'),
    makeEntry('logical_reasoning', 'MEDIUM'),
    makeEntry('technical_fundamentals', 'MEDIUM'),
    makeEntry('communication', 'STRONG'),
    makeEntry('quant_reasoning', 'MEDIUM'),
    makeEntry('time_pressure_handling', 'MEDIUM'),
  ]);
}

test('critical gap suppresses fit even though every other requirement is met or exceeded (spec §19)', () => {
  const result = calculateAlignment(scenarioA_oneCriticalGap(), SOFTWARE_DEVELOPER);

  assert.equal(result.fitScore, 55, 'fit should be capped to 55 by the single critical gap');
  assert.equal(result.readinessScore, 38);
  assert.equal(result.criticalGaps.length, 1);
  assert.equal(result.criticalGaps[0]?.capabilityId, 'programming');
  assert.equal(result.criticalGaps[0]?.isCritical, true);
  assert.equal(result.supportingGaps.length, 0, 'every non-critical requirement was met or exceeded');
  assert.equal(result.strengths.length, 6);
  assert.equal(result.state, 'DEVELOPING_ALIGNMENT');
  // The whole point of spec §16: never let these collapse into one number.
  assert.notEqual(result.fitScore, result.readinessScore);
});

test('next best action correctly targets the single critical gap', () => {
  const result = calculateAlignment(scenarioA_oneCriticalGap(), SOFTWARE_DEVELOPER);
  assert.equal(result.nextBestAction?.capabilityId, 'programming');
});

/**
 * Scenario D: two CORE requirements both WEAK -> two critical gaps.
 * Hand-derived: raw fit = 2.964102 / 4.4 = 0.673660; ceiling(2) = 0.47
 * -> fitScore = 47, which is below the 55 "developing" floor, so this
 * must land LOW_ALIGNMENT regardless of anything else in the profile.
 */
test('two critical gaps push fit below the developing floor into LOW_ALIGNMENT', () => {
  const dna = makeDna('student-d', [
    makeEntry('programming', 'WEAK'),
    makeEntry('problem_solving', 'WEAK'),
    makeEntry('logical_reasoning', 'MEDIUM'),
    makeEntry('technical_fundamentals', 'MEDIUM'),
    makeEntry('communication', 'STRONG'),
    makeEntry('quant_reasoning', 'MEDIUM'),
    makeEntry('time_pressure_handling', 'MEDIUM'),
  ]);
  const result = calculateAlignment(dna, SOFTWARE_DEVELOPER);
  assert.equal(result.fitScore, 47);
  assert.equal(result.criticalGaps.length, 2);
  assert.equal(result.state, 'LOW_ALIGNMENT');
});

/**
 * Scenario B/C: every requirement met or exceeded, zero gaps.
 * Unverified -> fit 100 / readiness 45 (a clean divergence purely from
 * verification status, demonstrating spec §16 without a single gap in
 * sight — fit alone is not enough to call this "strongly aligned").
 * Same profile, verified -> fit 100 / readiness 100 -> STRONGLY_ALIGNED.
 */
function fullyMetDataAnalystDna(verified: boolean) {
  return makeDna('student-b', [
    makeEntry('quant_reasoning', 'VERY_STRONG', { verified }),
    makeEntry('data_interpretation', 'VERY_STRONG', { verified }),
    makeEntry('logical_reasoning', 'STRONG', { verified }),
    makeEntry('technical_fundamentals', 'MEDIUM', { verified }),
    makeEntry('communication', 'STRONG', { verified }),
    makeEntry('programming', 'MEDIUM', { verified }),
    makeEntry('pattern_recognition', 'STRONG', { verified }),
  ]);
}

test('fit can be maxed while readiness lags when nothing is proof-verified yet', () => {
  const dataAnalyst = TARGET_PROFILES_SEED.find((t) => t.targetId === 'data_analyst')!;
  const result = calculateAlignment(fullyMetDataAnalystDna(false), dataAnalyst);
  assert.equal(result.fitScore, 100);
  assert.equal(result.readinessScore, 45);
  assert.equal(result.criticalGaps.length, 0);
  // High fit alone doesn't earn STRONGLY_ALIGNED without verified readiness.
  assert.equal(result.state, 'DEVELOPING_ALIGNMENT');
});

test('the same profile, proof-verified, reaches STRONGLY_ALIGNED', () => {
  const dataAnalyst = TARGET_PROFILES_SEED.find((t) => t.targetId === 'data_analyst')!;
  const result = calculateAlignment(fullyMetDataAnalystDna(true), dataAnalyst);
  assert.equal(result.fitScore, 100);
  assert.equal(result.readinessScore, 100);
  assert.equal(result.state, 'STRONGLY_ALIGNED');
});

test('a target with no evidence at all for a CORE requirement returns INSUFFICIENT_EVIDENCE and never fabricates a score', () => {
  const dna = makeDna('student-e', [
    // programming (CORE) is simply absent — no attempts recorded yet.
    makeEntry('problem_solving', 'STRONG'),
    makeEntry('logical_reasoning', 'MEDIUM'),
    makeEntry('technical_fundamentals', 'MEDIUM'),
    makeEntry('communication', 'STRONG'),
    makeEntry('quant_reasoning', 'MEDIUM'),
    makeEntry('time_pressure_handling', 'MEDIUM'),
  ]);
  const result = calculateAlignment(dna, SOFTWARE_DEVELOPER);
  assert.equal(result.state, 'INSUFFICIENT_EVIDENCE');
  assert.equal(result.fitScore, null);
  assert.equal(result.readinessScore, null);
  assert.equal(result.nextBestAction, null);
  assert.ok(result.insufficientEvidenceReason?.includes('Programming'));
});

test('calculateAlignment is deterministic — same input always produces the same output', () => {
  const dna = scenarioA_oneCriticalGap();
  const first = calculateAlignment(dna, SOFTWARE_DEVELOPER, [], new Date('2026-08-28T00:00:00Z'));
  const second = calculateAlignment(dna, SOFTWARE_DEVELOPER, [], new Date('2026-08-28T00:00:00Z'));
  assert.deepEqual(first.fitScore, second.fitScore);
  assert.deepEqual(first.readinessScore, second.readinessScore);
  assert.deepEqual(first.criticalGaps, second.criticalGaps);
});
