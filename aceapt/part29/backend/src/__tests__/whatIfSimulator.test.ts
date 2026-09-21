import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runWhatIf } from '../engine/whatIfSimulator';
import { TARGET_PROFILES_SEED } from '../config/targetProfiles.seed';
import { makeDna, makeEntry } from './testHelpers';

const SOFTWARE_DEVELOPER = TARGET_PROFILES_SEED.find((t) => t.targetId === 'software_developer')!;

test('improving the critical gap to STRONG removes the fit cap entirely (55 -> 100)', () => {
  const dna = makeDna('student-a', [
    makeEntry('programming', 'WEAK', { eventCount: 5 }),
    makeEntry('problem_solving', 'STRONG'),
    makeEntry('logical_reasoning', 'MEDIUM'),
    makeEntry('technical_fundamentals', 'MEDIUM'),
    makeEntry('communication', 'STRONG'),
    makeEntry('quant_reasoning', 'MEDIUM'),
    makeEntry('time_pressure_handling', 'MEDIUM'),
  ]);

  const result = runWhatIf(dna, SOFTWARE_DEVELOPER, {
    capabilityId: 'programming',
    projectedLevel: 'STRONG',
  });

  assert.equal(result.currentFitScore, 55);
  assert.equal(result.projectedFitScore, 100);
  assert.equal(result.projectionReliable, true);
  assert.equal(result.label, 'PROJECTED');
  // Readiness moves too, but improving the *level* alone must not silently
  // grant verified status — it should still reflect the unverified discount.
  assert.equal(result.currentReadinessScore, 38);
  assert.equal(result.projectedReadinessScore, 45);
});

test('a capability with no baseline evidence produces an unreliable (null) projection rather than a guess', () => {
  const dna = makeDna('student-thin', [
    makeEntry('problem_solving', 'STRONG'),
    makeEntry('logical_reasoning', 'MEDIUM'),
    makeEntry('technical_fundamentals', 'MEDIUM'),
    makeEntry('communication', 'STRONG'),
    makeEntry('quant_reasoning', 'MEDIUM'),
    makeEntry('time_pressure_handling', 'MEDIUM'),
    // programming has zero evidence — no entry at all
  ]);

  const result = runWhatIf(dna, SOFTWARE_DEVELOPER, {
    capabilityId: 'programming',
    projectedLevel: 'STRONG',
  });

  assert.equal(result.projectionReliable, false);
  assert.equal(result.projectedFitScore, null, 'no fake precision when there is no baseline to project from');
  assert.equal(result.projectedReadinessScore, null);
});
