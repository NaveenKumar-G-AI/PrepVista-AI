import { describe, it, expect } from 'vitest';
import { aggregateEvidence, overallQuality, summarizeEvidence } from '../domain/evidenceAggregation.js';
import type { RawAttemptRecord } from '../domain/ports.js';

function mkAttempt(overrides: Partial<RawAttemptRecord> = {}): RawAttemptRecord {
  return {
    attemptId: `a_${Math.random()}`,
    studentId: 's1',
    capability: 'arrays',
    difficulty: 'MEDIUM',
    isCorrect: true,
    performance: 1,
    timeTakenMs: 30_000,
    expectedTimeMs: 30_000,
    noveltyHint: 'RELATED',
    topic: 'arrays',
    occurredAt: new Date().toISOString(),
    sourceEvidenceType: 'PRACTICE',
    ...overrides,
  };
}

describe('aggregateEvidence', () => {
  it('gives more recent evidence a higher recency score than old evidence', async () => {
    const recent = await aggregateEvidence({
      studentId: 's1',
      attempts: [mkAttempt({ occurredAt: new Date().toISOString() })],
    });
    const old = await aggregateEvidence({
      studentId: 's1',
      attempts: [mkAttempt({ occurredAt: new Date(Date.now() - 60 * 86_400_000).toISOString() })],
    });
    expect(recent[0]!.quality.recency).toBeGreaterThan(old[0]!.quality.recency);
  });

  it('reduces independence for repeated (capability, difficulty, novelty) combinations', async () => {
    const attempts = Array.from({ length: 4 }).map(() => mkAttempt({ difficulty: 'MEDIUM', noveltyHint: 'RELATED' }));
    const evidence = await aggregateEvidence({ studentId: 's1', attempts });
    expect(evidence[0]!.quality.independence).toBe(1);
    expect(evidence[3]!.quality.independence).toBeLessThan(evidence[0]!.quality.independence);
  });

  it('falls back to RELATED novelty when no hint and no classifier is provided (Section 10 fallback)', async () => {
    const evidence = await aggregateEvidence({ studentId: 's1', attempts: [mkAttempt({ noveltyHint: null })] });
    expect(evidence[0]!.novelty).toBe('RELATED');
  });

  it('uses a novelty classifier when one is provided instead of the naive fallback', async () => {
    const evidence = await aggregateEvidence({
      studentId: 's1',
      attempts: [mkAttempt({ noveltyHint: null })],
      noveltyClassifier: { classify: async () => 'HIGHLY_NOVEL' },
    });
    expect(evidence[0]!.novelty).toBe('HIGHLY_NOVEL');
  });

  it('scores implausibly fast answers lower on time pressure than answers near the expected time', async () => {
    const plausible = await aggregateEvidence({
      studentId: 's1', attempts: [mkAttempt({ timeTakenMs: 29_000, expectedTimeMs: 30_000 })],
    });
    const suspiciouslyFast = await aggregateEvidence({
      studentId: 's1', attempts: [mkAttempt({ timeTakenMs: 3_000, expectedTimeMs: 30_000 })],
    });
    expect(plausible[0]!.quality.timePressure).toBeGreaterThan(suspiciouslyFast[0]!.quality.timePressure);
  });
});

describe('overallQuality', () => {
  it('stays within [0, 1] and rewards a uniformly strong quality profile over a weak one', () => {
    const strong = overallQuality({
      recency: 0.9, diversity: 0.9, difficulty: 0.9, novelty: 0.9, independence: 0.9,
      timePressure: 0.9, targetRelevance: 0.9, repeatedPerformance: 0.9,
    });
    const weak = overallQuality({
      recency: 0.1, diversity: 0.1, difficulty: 0.1, novelty: 0.1, independence: 0.1,
      timePressure: 0.1, targetRelevance: 0.1, repeatedPerformance: 0.1,
    });
    expect(strong).toBeGreaterThan(weak);
    expect(strong).toBeLessThanOrEqual(1);
    expect(weak).toBeGreaterThanOrEqual(0);
  });
});

describe('summarizeEvidence', () => {
  it('groups by evidence type and computes overall quality across an empty set safely', async () => {
    const empty = summarizeEvidence([]);
    expect(empty.totalCount).toBe(0);
    expect(empty.overallQuality).toBe(0);

    const evidence = await aggregateEvidence({
      studentId: 's1',
      attempts: [
        mkAttempt({ sourceEvidenceType: 'PRACTICE', performance: 1 }),
        mkAttempt({ sourceEvidenceType: 'PRACTICE', performance: 0.5 }),
        mkAttempt({ sourceEvidenceType: 'TRANSFER', performance: 0.8 }),
      ],
    });
    const summary = summarizeEvidence(evidence);
    expect(summary.totalCount).toBe(3);
    expect(summary.byType.PRACTICE?.count).toBe(2);
    expect(summary.byType.TRANSFER?.count).toBe(1);
    expect(summary.byType.PRACTICE?.avgPerformance).toBeCloseTo(0.75);
  });
});
