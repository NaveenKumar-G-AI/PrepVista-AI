import { describe, it, expect } from 'vitest';
import { classifyGapSeverity } from '../../src/services/futureGap.service';

describe('classifyGapSeverity', () => {
  it('returns UNKNOWN when confidence is UNKNOWN, regardless of magnitude', () => {
    expect(classifyGapSeverity({ gapMagnitude: 0.9, marketExpectation: 0.9, confidence: 'UNKNOWN' })).toBe('UNKNOWN');
  });

  it('returns CRITICAL for a large gap on a highly-expected skill with HIGH confidence', () => {
    expect(classifyGapSeverity({ gapMagnitude: 0.6, marketExpectation: 0.6, confidence: 'HIGH' })).toBe('CRITICAL');
  });

  it('caps severity at MODERATE when confidence is LOW, even for a huge raw gap (spec: never convert a small sample into a strong forecast)', () => {
    const result = classifyGapSeverity({ gapMagnitude: 0.9, marketExpectation: 0.9, confidence: 'LOW' });
    expect(result).not.toBe('CRITICAL');
    expect(result).not.toBe('HIGH');
    expect(result).toBe('MODERATE');
  });

  it('returns HIGH for a moderately large priority score', () => {
    expect(classifyGapSeverity({ gapMagnitude: 0.5, marketExpectation: 0.5, confidence: 'HIGH' })).toBe('HIGH'); // priorityScore 0.25
  });

  it('returns MODERATE for a modest priority score', () => {
    expect(classifyGapSeverity({ gapMagnitude: 0.3, marketExpectation: 0.35, confidence: 'MODERATE' })).toBe('MODERATE'); // priorityScore 0.105
  });

  it('returns OPTIONAL for a low priority score (low magnitude or low market relevance)', () => {
    expect(classifyGapSeverity({ gapMagnitude: 0.2, marketExpectation: 0.2, confidence: 'HIGH' })).toBe('OPTIONAL'); // priorityScore 0.04
  });

  it('a gap on a barely-relevant skill never reaches CRITICAL even with total absence of evidence', () => {
    // marketExpectation right at the RELEVANCE_FLOOR used by computeAndStoreFutureGaps
    expect(classifyGapSeverity({ gapMagnitude: 0.15, marketExpectation: 0.15, confidence: 'HIGH' })).not.toBe('CRITICAL');
  });
});
