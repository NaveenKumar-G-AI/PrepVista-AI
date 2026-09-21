import { describe, it, expect } from 'vitest';
import { computeConfidence, isStale, hasInsufficientEvidence, MIN_SAMPLE_FOR_ANY_SIGNAL } from '../../src/lib/confidence';

describe('computeConfidence', () => {
  it('returns UNKNOWN below the minimum sample size regardless of other inputs', () => {
    expect(computeConfidence({ sampleSize: MIN_SAMPLE_FOR_ANY_SIGNAL - 1, sourceQuality: 1, recencyDays: 0, sourceAgreement: 1 })).toBe('UNKNOWN');
  });

  it('returns HIGH for a large, high-quality, fresh, agreed-upon sample', () => {
    expect(computeConfidence({ sampleSize: 100, sourceQuality: 1, recencyDays: 0, sourceAgreement: 1 })).toBe('HIGH');
  });

  it('returns LOW for a small sample even with perfect quality/recency/agreement', () => {
    const result = computeConfidence({ sampleSize: 4, sourceQuality: 1, recencyDays: 0, sourceAgreement: 1 });
    expect(['LOW', 'MODERATE']).toContain(result); // small N alone caps the score meaningfully
  });

  it('degrades confidence as data goes stale', () => {
    // Sample-size and source-quality contributions deliberately mid-range
    // here (32 + 18 + agreement 10 = 60 baseline) so recency's swing (0 to
    // 20 points) is what crosses the HIGH/MODERATE boundary at 75 -- with
    // every OTHER dimension maxed out (as in the HIGH test above), recency
    // alone can't cross a tier, which is intended (staleness is one of four
    // signals, not solely determinative -- spec ??61 flags it separately via
    // isStale() regardless of the blended confidence tier).
    const fresh = computeConfidence({ sampleSize: 20, sourceQuality: 0.6, recencyDays: 10, sourceAgreement: 1 });
    const stale = computeConfidence({ sampleSize: 20, sourceQuality: 0.6, recencyDays: 400, sourceAgreement: 1 });
    const rank = { UNKNOWN: 0, LOW: 1, MODERATE: 2, HIGH: 3 };
    expect(rank[stale]).toBeLessThan(rank[fresh]);
  });

  it('degrades confidence when sources disagree', () => {
    // sampleSize=25 saturates its contribution at 40; sourceQuality 0.4 -> 12;
    // recency fresh -> 20. Baseline 72, so agreement's swing (0 to 10 points)
    // crosses the HIGH/MODERATE boundary at 75.
    const agree = computeConfidence({ sampleSize: 25, sourceQuality: 0.4, recencyDays: 0, sourceAgreement: 1 });
    const disagree = computeConfidence({ sampleSize: 25, sourceQuality: 0.4, recencyDays: 0, sourceAgreement: 0 });
    const rank = { UNKNOWN: 0, LOW: 1, MODERATE: 2, HIGH: 3 };
    expect(rank[disagree]).toBeLessThan(rank[agree]);
  });
});

describe('isStale', () => {
  it('is false for recent data', () => {
    expect(isStale(new Date(Date.now() - 10 * 24 * 60 * 60 * 1000))).toBe(false);
  });
  it('is true for data older than the stale threshold', () => {
    expect(isStale(new Date(Date.now() - 400 * 24 * 60 * 60 * 1000))).toBe(true);
  });
});

describe('hasInsufficientEvidence', () => {
  it('flags sample sizes below the floor', () => {
    expect(hasInsufficientEvidence(0)).toBe(true);
    expect(hasInsufficientEvidence(MIN_SAMPLE_FOR_ANY_SIGNAL - 1)).toBe(true);
    expect(hasInsufficientEvidence(MIN_SAMPLE_FOR_ANY_SIGNAL)).toBe(false);
  });
});
