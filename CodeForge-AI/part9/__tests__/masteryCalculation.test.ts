import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { calculateMastery } from '../src/domain/masteryCalculation.js';
import type { SkillEvidence } from '../src/domain/types.js';

function daysAgo(now: Date, n: number): string {
  return new Date(now.getTime() - n * 24 * 60 * 60 * 1000).toISOString();
}

const base = (overrides: Partial<SkillEvidence> = {}): SkillEvidence => ({
  id: randomUUID(),
  studentId: 's1',
  skillId: 'skill1',
  problemId: 'p1',
  source: 'PRACTICE',
  difficulty: 'medium',
  independent: true,
  hintsUsed: 0,
  solutionViewed: false,
  isTransfer: false,
  timed: false,
  passed: true,
  createdAt: new Date().toISOString(),
  ...overrides,
});

describe('calculateMastery — PHASE 76 critical scenarios', () => {
  it('returns UNKNOWN, never WEAK, when there is no evidence', () => {
    const result = calculateMastery([]);
    expect(result.state).toBe('UNKNOWN');
    expect(result.confidence).toBe(0);
  });

  it('does not call a single easy independent pass MASTERED', () => {
    const result = calculateMastery([base({ difficulty: 'easy' })]);
    expect(result.state).not.toBe('MASTERED');
    expect(result.state).toBe('DEVELOPING');
  });

  it('caps the contribution of solving the same problem many times', () => {
    const now = new Date();
    const manyAttempts = calculateMastery(
      Array.from({ length: 20 }, (_, i) =>
        base({ id: `e${i}`, problemId: 'same-problem', createdAt: new Date(now.getTime() + i * 1000).toISOString() })
      ),
      now
    );
    const single = calculateMastery([base({ problemId: 'same-problem', createdAt: now.toISOString() })], now);

    // 20 submissions of the same problem should NOT be worth anywhere near 20x a single one.
    expect(manyAttempts.rawScore).toBeLessThan(single.rawScore * 5);
    expect(manyAttempts.rawScore).toBeGreaterThan(single.rawScore); // still worth *something*
  });

  it('reduces evidence weight when the solution was viewed before passing', () => {
    const now = new Date();
    const viewed = calculateMastery([base({ solutionViewed: true, createdAt: now.toISOString() })], now);
    const independent = calculateMastery([base({ solutionViewed: false, createdAt: now.toISOString() })], now);
    expect(viewed.rawScore).toBeLessThan(independent.rawScore);
    expect(viewed.independentPassCount).toBe(0);
  });

  it('treats hint-assisted success as valid learning evidence but not independent evidence', () => {
    const guided = calculateMastery([base({ independent: false, hintsUsed: 2 })]);
    expect(guided.state).toBe('LEARNING');
    expect(guided.independentPassCount).toBe(0);
  });

  it('gives strong weight to an unfamiliar transfer problem', () => {
    const result = calculateMastery([base({ isTransfer: true, difficulty: 'hard' })]);
    expect(result.transferPassCount).toBe(1);
    expect(result.rawScore).toBeGreaterThan(0.8);
  });

  it('requires independent + transfer + high-stakes evidence together for MASTERED', () => {
    const now = new Date();
    const evidence: SkillEvidence[] = [
      base({ id: '1', difficulty: 'easy', createdAt: daysAgo(now, 10) }),
      base({ id: '2', difficulty: 'medium', createdAt: daysAgo(now, 8) }),
      base({ id: '3', difficulty: 'hard', createdAt: daysAgo(now, 6) }),
      base({ id: '4', difficulty: 'hard', createdAt: daysAgo(now, 4) }),
      base({ id: '5', isTransfer: true, difficulty: 'hard', createdAt: daysAgo(now, 3) }),
      base({ id: '6', source: 'TIMED_ASSESSMENT', difficulty: 'hard', createdAt: daysAgo(now, 1) }),
    ];
    expect(calculateMastery(evidence, now).state).toBe('MASTERED');
  });

  it('marks a MASTERED skill STALE after the decay window with no reinforcing evidence', () => {
    const now = new Date();
    const evidence: SkillEvidence[] = [
      base({ id: '1', difficulty: 'easy', createdAt: daysAgo(now, 200) }),
      base({ id: '2', difficulty: 'medium', createdAt: daysAgo(now, 198) }),
      base({ id: '3', difficulty: 'hard', createdAt: daysAgo(now, 196) }),
      base({ id: '4', difficulty: 'hard', createdAt: daysAgo(now, 194) }),
      base({ id: '5', isTransfer: true, difficulty: 'hard', createdAt: daysAgo(now, 193) }),
      base({ id: '6', source: 'TIMED_ASSESSMENT', difficulty: 'hard', createdAt: daysAgo(now, 191) }),
    ];
    const result = calculateMastery(evidence, now);
    expect(result.state).toBe('STALE');
    expect(result.isStale).toBe(true);
  });

  it('does not silently drop evidence marked as superseded by a correction, it excludes it explicitly', () => {
    const now = new Date();
    const withCorrection = calculateMastery(
      [base({ passed: true, difficulty: 'hard' }), base({ id: 'bad', passed: true, difficulty: 'hard', supersededByCorrection: true })],
      now
    );
    const withoutBad = calculateMastery([base({ passed: true, difficulty: 'hard' })], now);
    expect(withCorrection.evidenceCount).toBe(withoutBad.evidenceCount);
    expect(withCorrection.rawScore).toBe(withoutBad.rawScore);
  });
});
