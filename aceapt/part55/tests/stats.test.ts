import { describe, it, expect } from 'vitest';
import {
  wilsonScoreInterval,
  twoProportionZTest,
  median,
  percentile,
  trimOutliersIQR,
  contentHash,
  clamp01,
} from '../src/lib/stats.js';

describe('wilsonScoreInterval', () => {
  it('returns a wide interval for zero observations', () => {
    const r = wilsonScoreInterval(0, 0);
    expect(r.low).toBe(0);
    expect(r.high).toBe(1);
  });

  it('narrows as sample size grows for the same proportion', () => {
    const small = wilsonScoreInterval(7, 10);
    const large = wilsonScoreInterval(700, 1000);
    expect(large.high - large.low).toBeLessThan(small.high - small.low);
  });

  it('never goes below 0 or above 1', () => {
    const allFail = wilsonScoreInterval(0, 20);
    const allPass = wilsonScoreInterval(20, 20);
    expect(allFail.low).toBeGreaterThanOrEqual(0);
    expect(allPass.high).toBeLessThanOrEqual(1);
  });

  it('point estimate matches the raw proportion', () => {
    const r = wilsonScoreInterval(30, 100);
    expect(r.point).toBeCloseTo(0.3, 5);
  });
});

describe('twoProportionZTest', () => {
  it('finds no significant difference for identical proportions', () => {
    const { pValue } = twoProportionZTest(50, 100, 50, 100);
    expect(pValue).toBeGreaterThan(0.9);
  });

  it('finds a significant difference for a large, well-powered shift', () => {
    const { pValue } = twoProportionZTest(80, 100, 40, 100);
    expect(pValue).toBeLessThan(0.001);
  });

  it('handles zero sample size without throwing', () => {
    const { pValue } = twoProportionZTest(0, 0, 5, 10);
    expect(pValue).toBe(1);
  });
});

describe('median / percentile', () => {
  it('returns null for empty input', () => {
    expect(median([])).toBeNull();
    expect(percentile([], 0.5)).toBeNull();
  });

  it('computes median correctly for odd and even length arrays', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([1, 2, 3, 4])).toBe(2.5);
  });

  it('p25/p75 bracket the median', () => {
    const values = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
    const p25 = percentile(values, 0.25)!;
    const p75 = percentile(values, 0.75)!;
    expect(p25).toBeLessThan(median(values)!);
    expect(p75).toBeGreaterThan(median(values)!);
  });
});

describe('trimOutliersIQR', () => {
  it('leaves small arrays untouched', () => {
    const { kept, droppedCount } = trimOutliersIQR([1, 2, 3]);
    expect(kept).toEqual([1, 2, 3]);
    expect(droppedCount).toBe(0);
  });

  it('drops a single extreme outlier without moving the bulk of the distribution', () => {
    // spec §25: one student takes 17 minutes on a ~30s question
    const normal = Array.from({ length: 30 }, () => 28000 + Math.random() * 4000);
    const withOutlier = [...normal, 17 * 60 * 1000];
    const { kept, droppedCount } = trimOutliersIQR(withOutlier);
    expect(droppedCount).toBe(1);
    expect(Math.max(...kept)).toBeLessThan(40000);
  });
});

describe('contentHash', () => {
  it('is deterministic', () => {
    expect(contentHash('hello world')).toBe(contentHash('hello world'));
  });

  it('differs for different content', () => {
    expect(contentHash('hello world')).not.toBe(contentHash('hello world!'));
  });
});

describe('clamp01', () => {
  it('clamps to [0,1]', () => {
    expect(clamp01(-5)).toBe(0);
    expect(clamp01(5)).toBe(1);
    expect(clamp01(0.5)).toBe(0.5);
  });
});
