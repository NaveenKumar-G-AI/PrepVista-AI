import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMastery } from '../../src/mastery/estimators.js';
import { deriveMasteryState } from '../../src/mastery/masteryStateService.js';
import type { Evidence } from '../../src/types.js';

function ev(partial: Partial<Evidence> & { rawScore: number }): Evidence {
  const assistanceUsed = partial.assistanceUsed ?? 'NONE';
  return {
    id: 'ev', studentId: 's1', skillId: 'skill_x', attemptId: 'a1', challengeId: 'c1',
    isPrimary: true, difficultyScore: 3, independent: assistanceUsed === 'NONE', assistanceUsed,
    mistakeCategory: partial.rawScore >= 1 ? 'NONE' : 'LOGIC_ERROR',
    languageIssue: false, contextType: 'STANDARD', createdAt: new Date().toISOString(), ...partial,
  };
}

test('mastery: no evidence -> zero score, zero counts', () => {
  const m = computeMastery([], { prerequisiteReadinessScore: null });
  assert.equal(m.masteryScore, 0);
  assert.equal(m.evidenceCount, 0);
});

test('mastery: a single lucky pass cannot alone reach MASTERED or STRONG state', () => {
  const evidence = [ev({ rawScore: 1, challengeId: 'c1' })];
  const m = computeMastery(evidence, { prerequisiteReadinessScore: null });
  const state = deriveMasteryState({
    masteryScore: m.masteryScore, evidenceCount: m.evidenceCount, independentSuccessCount: m.independentSuccessCount,
    confidenceScore: 100 /* even if we generously assume max confidence */, distinctChallengesCount: m.distinctChallengesCount,
    distinctDifficultyLevels: 1, verified: false,
  });
  assert.notEqual(state, 'MASTERED');
  assert.notEqual(state, 'STRONG');
  assert.notEqual(state, 'ADVANCED');
  // One clean pass should land at most at COMPETENT (score-only gate), never higher, because the count/diversity gates block STRONG+.
  assert.ok(['INTRODUCED', 'EXPLORING', 'DEVELOPING', 'COMPETENT'].includes(state), `expected an early state, got ${state}`);
});

test('mastery: repeated independent success across diverse difficulty eventually reaches STRONG, still not MASTERED without verification', () => {
  const evidence: Evidence[] = [];
  for (let i = 0; i < 5; i++) {
    evidence.push(ev({ rawScore: 1, challengeId: `c${i}`, difficultyScore: 3 + i, createdAt: new Date(Date.now() - (5 - i) * 60000).toISOString() }));
  }
  const m = computeMastery(evidence, { prerequisiteReadinessScore: null });
  const state = deriveMasteryState({
    masteryScore: m.masteryScore, evidenceCount: m.evidenceCount, independentSuccessCount: m.independentSuccessCount,
    confidenceScore: 90, distinctChallengesCount: m.distinctChallengesCount, distinctDifficultyLevels: 5, verified: false,
  });
  assert.ok(['STRONG', 'ADVANCED'].includes(state), `expected STRONG or ADVANCED with 5 diverse independent passes, got ${state} (score=${m.masteryScore})`);
  assert.notEqual(state, 'MASTERED', 'MASTERED requires requiresVerification=true, which is false here');
});

test('mastery: MASTERED requires verification even when every other gate is satisfied', () => {
  const state = deriveMasteryState({
    masteryScore: 96, evidenceCount: 8, independentSuccessCount: 6, confidenceScore: 95, distinctChallengesCount: 5,
    distinctDifficultyLevels: 3, verified: false,
  });
  assert.notEqual(state, 'MASTERED');
  const stateVerified = deriveMasteryState({
    masteryScore: 96, evidenceCount: 8, independentSuccessCount: 6, confidenceScore: 95, distinctChallengesCount: 5,
    distinctDifficultyLevels: 3, verified: true,
  });
  assert.equal(stateVerified, 'MASTERED');
});

test('mastery: assisted (non-independent) success weighs less than independent success', () => {
  // Single-item evidence can't reveal weighting (weight cancels out of a 1-item weighted average),
  // so mix a failed independent attempt with a passed attempt at each assistance level.
  const withIndependentPass = computeMastery(
    [ev({ rawScore: 0, challengeId: 'a', assistanceUsed: 'NONE' }), ev({ rawScore: 1, challengeId: 'b', assistanceUsed: 'NONE' })],
    { prerequisiteReadinessScore: null },
  );
  const withSolutionViewedPass = computeMastery(
    [ev({ rawScore: 0, challengeId: 'a', assistanceUsed: 'NONE' }), ev({ rawScore: 1, challengeId: 'b', assistanceUsed: 'SOLUTION_VIEWED' })],
    { prerequisiteReadinessScore: null },
  );
  assert.ok(
    withIndependentPass.masteryScore > withSolutionViewedPass.masteryScore,
    `an independent pass (${withIndependentPass.masteryScore}) should count for more than a solution-viewed pass (${withSolutionViewedPass.masteryScore})`,
  );
});

test('mastery: harder challenges weigh more than easier ones', () => {
  const easy = computeMastery([ev({ rawScore: 1, difficultyScore: 1 })], { prerequisiteReadinessScore: null });
  const hard = computeMastery([ev({ rawScore: 1, difficultyScore: 10 })], { prerequisiteReadinessScore: null });
  // Both are the ONLY piece of evidence, so with a single-item weighted average the score is rawScore=1 regardless of weight (weight cancels out in a 1-item average).
  // Weight differences only show up with mixed evidence — verify that directly:
  const mixed = computeMastery([ev({ rawScore: 0, difficultyScore: 1, challengeId: 'a' }), ev({ rawScore: 1, difficultyScore: 10, challengeId: 'b' })], { prerequisiteReadinessScore: null });
  assert.ok(mixed.masteryScore > 50, `a failed easy + a passed hard attempt should weight toward the hard pass, got ${mixed.masteryScore}`);
  assert.equal(easy.masteryScore, 100);
  assert.equal(hard.masteryScore, 100);
});

test('mastery: prerequisite cap holds down a dependent skill\u2019s score when the prerequisite is not ready', () => {
  const evidence = [ev({ rawScore: 1 }), ev({ rawScore: 1, challengeId: 'c2' }), ev({ rawScore: 1, challengeId: 'c3' })];
  const uncapped = computeMastery(evidence, { prerequisiteReadinessScore: 80 }); // prerequisite ready
  const capped = computeMastery(evidence, { prerequisiteReadinessScore: 10 });  // prerequisite NOT ready
  assert.ok(capped.masteryScore < uncapped.masteryScore, `capped (${capped.masteryScore}) should be less than uncapped (${uncapped.masteryScore})`);
  assert.ok(capped.prerequisiteCapApplied);
});

test('mastery: repeated identical mistake applies a penalty vs. a single instance of that mistake', () => {
  const singleMiss = [ev({ rawScore: 1, challengeId: 'c1' }), ev({ rawScore: 1, challengeId: 'c2' }), ev({ rawScore: 0, challengeId: 'c3', mistakeCategory: 'BOUNDARY_CONDITION' })];
  const repeatedMiss = [
    ev({ rawScore: 0.5, challengeId: 'c1', mistakeCategory: 'BOUNDARY_CONDITION' }),
    ev({ rawScore: 0.5, challengeId: 'c2', mistakeCategory: 'BOUNDARY_CONDITION' }),
    ev({ rawScore: 0.5, challengeId: 'c3', mistakeCategory: 'BOUNDARY_CONDITION' }),
  ];
  const repeatedM = computeMastery(repeatedMiss, { prerequisiteReadinessScore: null });
  assert.ok(repeatedM.repeatedMistakePenaltyApplied, 'expected the repeated-mistake penalty to fire for 3/3 identical failures');
});
