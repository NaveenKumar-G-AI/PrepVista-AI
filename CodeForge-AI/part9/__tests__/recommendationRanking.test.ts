import { describe, expect, it } from 'vitest';
import { rankRecommendations, type SkillCandidate } from '../src/domain/recommendationRanking.js';

const candidate = (overrides: Partial<SkillCandidate>): SkillCandidate => ({
  skillId: 'x',
  roleImportance: 0.5,
  currentState: 'DEVELOPING',
  targetState: 'STRONG',
  retentionOverdueDays: 0,
  hasTransferEvidence: false,
  lastRecommendedDaysAgo: null,
  suggestedAction: 'GUIDED_PRACTICE',
  ...overrides,
});

describe('rankRecommendations — PHASE 20/64', () => {
  it('prioritizes a role-relevant gap over an already-mastered, low-urgency skill', () => {
    const results = rankRecommendations([
      candidate({ skillId: 'arrays', roleImportance: 0.9, currentState: 'MASTERED', targetState: 'MASTERED', hasTransferEvidence: true, suggestedAction: 'RETENTION_CHECK' }),
      candidate({ skillId: 'dp', roleImportance: 0.9, currentState: 'DEVELOPING', targetState: 'STRONG' }),
    ]);
    expect(results[0]?.skillId).toBe('dp');
    expect(results[0]?.isPrimary).toBe(true);
    expect(results[1]?.isPrimary).toBe(false);
  });

  it('produces a different #1 recommendation when the target role changes (PHASE 30/76)', () => {
    const sql = (importance: number) => candidate({ skillId: 'sql', roleImportance: importance });
    const react = (importance: number) => candidate({ skillId: 'react', roleImportance: importance });

    const forBackend = rankRecommendations([sql(0.9), react(0.1)]);
    const forFrontend = rankRecommendations([sql(0.1), react(0.9)]);

    expect(forBackend[0]?.skillId).toBe('sql');
    expect(forFrontend[0]?.skillId).toBe('react');
  });

  it('surfaces the prerequisite skillId directly, not the blocked skill, when recommending a prerequisite', () => {
    const results = rankRecommendations([
      candidate({ skillId: 'state-modeling', blockingSkillId: 'dynamic-programming', roleImportance: 0.9 }),
    ]);
    expect(results[0]?.skillId).toBe('state-modeling');
    expect(results[0]?.blockingSkillId).toBe('dynamic-programming');
  });

  it('never returns more than one primary recommendation', () => {
    const results = rankRecommendations([candidate({ skillId: 'a' }), candidate({ skillId: 'b' }), candidate({ skillId: 'c' })]);
    expect(results.filter((r) => r.isPrimary)).toHaveLength(1);
  });
});
