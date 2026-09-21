import { describe, expect, it } from 'vitest';
import { detectBottlenecks } from '../../src/domain/bottlenecks';
import { MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT } from '../../src/domain/calibration';
import type { DecisionAggregateStats } from '../../src/types';

function stats(overrides: Partial<DecisionAggregateStats> = {}): DecisionAggregateStats {
  return {
    totalUncertainDecisions: 20,
    blindGuessRate: 0,
    eliminationRate: 0.6,
    strategicSkipRate: 0,
    potentiallyUnnecessarySkipRate: 0,
    timeOverrunRate: 0,
    unsupportedSwitchRate: 0,
    periodStart: new Date().toISOString(),
    periodEnd: new Date().toISOString(),
    ...overrides,
  };
}

describe('detectBottlenecks', () => {
  it('returns nothing below the minimum sample size, regardless of how bad the stats look (§205)', () => {
    const findings = detectBottlenecks(stats({ blindGuessRate: 0.9 }), MIN_SAMPLE_SIZE_FOR_CALIBRATION_INSIGHT - 1);
    expect(findings).toHaveLength(0);
  });

  it('flags TOO_MUCH_GUESSING once blind-guess rate crosses the threshold with enough samples', () => {
    const findings = detectBottlenecks(stats({ blindGuessRate: 0.6 }), 20);
    expect(findings.some((f) => f.bottleneck === 'TOO_MUCH_GUESSING')).toBe(true);
  });

  it('flags WEAK_ELIMINATION when elimination rate is low, not when it is healthy', () => {
    const weak = detectBottlenecks(stats({ eliminationRate: 0.05 }), 20);
    expect(weak.some((f) => f.bottleneck === 'WEAK_ELIMINATION')).toBe(true);

    const healthy = detectBottlenecks(stats({ eliminationRate: 0.6 }), 20);
    expect(healthy.some((f) => f.bottleneck === 'WEAK_ELIMINATION')).toBe(false);
  });

  it('assigns HIGH confidence only at a larger sample size, MEDIUM otherwise', () => {
    const medium = detectBottlenecks(stats({ blindGuessRate: 0.6 }), 15);
    expect(medium[0]?.confidence).toBe('MEDIUM');

    const high = detectBottlenecks(stats({ blindGuessRate: 0.6 }), 40);
    expect(high[0]?.confidence).toBe('HIGH');
  });

  it('returns an empty list for healthy stats — never invents a bottleneck', () => {
    expect(detectBottlenecks(stats(), 50)).toHaveLength(0);
  });
});
