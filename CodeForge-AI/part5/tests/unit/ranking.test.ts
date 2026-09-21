import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreCandidate, rankCandidates, type RankingContext } from '../../src/recommendation/rankingEngine.js';
import type { Challenge } from '../../src/types.js';

function challenge(overrides: Partial<Challenge> = {}): Challenge {
  return {
    id: 'c1', title: 'Test', primarySkillId: 'skill_arrays', secondarySkillIds: [], difficultyLevel: 'MEDIUM',
    difficultyScore: 5, conceptDifficulty: 3, implementationComplexity: 3, constraintComplexity: 3, reasoningComplexity: 3,
    ambiguity: 1, contextType: 'STANDARD', harnessType: 'function', languagesSupported: ['javascript'], status: 'ACTIVE',
    isVerification: false, prompt: '', functionName: 'fn', transferOfChallengeId: null, ...overrides,
  };
}
function baseCtx(overrides: Partial<RankingContext> = {}): RankingContext {
  return {
    targetSkillId: 'skill_arrays', gapType: 'KNOWLEDGE_GAP', gapSeverity: 0.5, targetDifficultyLevel: 'MEDIUM',
    rolePriority: null, goalBoostsSkillGap: false, goalPrefersInterviewStyle: false, recentlyAttemptedChallengeIds: [],
    deliberateRepetitionChallengeId: null, skillHasDueReview: false, isTransferTarget: false, recentlyTargetedSkillIds: [],
    ...overrides,
  };
}

test('ranking: every signal is a plain inspectable number in the breakdown, not a black box', () => {
  const result = scoreCandidate(challenge(), baseCtx());
  for (const key of ['skillGap', 'prerequisiteFit', 'difficultyFit', 'roleRelevance', 'goalRelevance', 'learningValue', 'freshness', 'diversity', 'mistakeRelevance', 'retentionValue', 'repetitionPenalty']) {
    assert.ok(key in result.breakdown, `missing signal ${key}`);
    assert.equal(typeof result.breakdown[key], 'number');
  }
});

test('ranking: higher gap severity on the target skill increases the score', () => {
  const low = scoreCandidate(challenge(), baseCtx({ gapSeverity: 0.1 }));
  const high = scoreCandidate(challenge(), baseCtx({ gapSeverity: 0.9 }));
  assert.ok(high.score > low.score);
});

test('ranking: a recently-attempted challenge is penalized vs a fresh one, all else equal', () => {
  const fresh = scoreCandidate(challenge({ id: 'c1' }), baseCtx({ recentlyAttemptedChallengeIds: [] }));
  const stale = scoreCandidate(challenge({ id: 'c1' }), baseCtx({ recentlyAttemptedChallengeIds: ['c1'] }));
  assert.ok(fresh.score > stale.score);
});

test('ranking: a deliberately targeted repetition is NOT penalized even though it was recently attempted (Phase 23)', () => {
  const accidental = scoreCandidate(challenge({ id: 'c1' }), baseCtx({ recentlyAttemptedChallengeIds: ['c1'], deliberateRepetitionChallengeId: null }));
  const deliberate = scoreCandidate(challenge({ id: 'c1' }), baseCtx({ recentlyAttemptedChallengeIds: ['c1'], deliberateRepetitionChallengeId: 'c1' }));
  assert.ok(deliberate.score > accidental.score, 'deliberate repetition should score higher than an accidental repeat of the same challenge');
  assert.equal(deliberate.breakdown.repetitionPenalty, 0);
});

test('ranking: difficulty fit is highest when the challenge exactly matches the target level and decays with distance', () => {
  const exact = scoreCandidate(challenge({ difficultyLevel: 'MEDIUM' }), baseCtx({ targetDifficultyLevel: 'MEDIUM' }));
  const oneOff = scoreCandidate(challenge({ difficultyLevel: 'HARD' }), baseCtx({ targetDifficultyLevel: 'MEDIUM' }));
  const farOff = scoreCandidate(challenge({ difficultyLevel: 'ADVANCED' }), baseCtx({ targetDifficultyLevel: 'EASY' }));
  assert.equal(exact.breakdown.difficultyFit, 1);
  assert.ok(exact.breakdown.difficultyFit > oneOff.breakdown.difficultyFit);
  assert.ok(oneOff.breakdown.difficultyFit > farOff.breakdown.difficultyFit);
});

test('ranking: role priority increases roleRelevance monotonically with priority level', () => {
  const low = scoreCandidate(challenge(), baseCtx({ rolePriority: 'LOW' }));
  const med = scoreCandidate(challenge(), baseCtx({ rolePriority: 'MEDIUM' }));
  const high = scoreCandidate(challenge(), baseCtx({ rolePriority: 'HIGH' }));
  const veryHigh = scoreCandidate(challenge(), baseCtx({ rolePriority: 'VERY_HIGH' }));
  assert.ok(low.breakdown.roleRelevance < med.breakdown.roleRelevance);
  assert.ok(med.breakdown.roleRelevance < high.breakdown.roleRelevance);
  assert.ok(high.breakdown.roleRelevance < veryHigh.breakdown.roleRelevance);
});

test('ranking: a NOVEL-context challenge scores higher mistakeRelevance than STANDARD when targeting a transfer gap', () => {
  const standard = scoreCandidate(challenge({ contextType: 'STANDARD' }), baseCtx({ isTransferTarget: true }));
  const novel = scoreCandidate(challenge({ contextType: 'NOVEL' }), baseCtx({ isTransferTarget: true }));
  assert.ok(novel.breakdown.mistakeRelevance > standard.breakdown.mistakeRelevance);
});

test('ranking: rankCandidates sorts descending by score', () => {
  const challenges = [challenge({ id: 'low', primarySkillId: 'skill_other' }), challenge({ id: 'high', primarySkillId: 'skill_arrays' })];
  const ranked = rankCandidates(challenges, baseCtx({ gapSeverity: 0.9 }));
  assert.equal(ranked[0].challenge.id, 'high');
  assert.ok(ranked[0].score >= ranked[1].score);
});

test('ranking: a challenge that does not touch the target skill at all scores below one that does, all else equal', () => {
  const onTopic = scoreCandidate(challenge({ primarySkillId: 'skill_arrays' }), baseCtx({ targetSkillId: 'skill_arrays', gapSeverity: 0.8 }));
  const offTopic = scoreCandidate(challenge({ primarySkillId: 'skill_graphs' }), baseCtx({ targetSkillId: 'skill_arrays', gapSeverity: 0.8 }));
  assert.ok(onTopic.score > offTopic.score);
});
