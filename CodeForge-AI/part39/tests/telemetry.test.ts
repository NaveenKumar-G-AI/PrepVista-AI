import { Telemetry } from '../src/telemetry/Telemetry';
import { CostBasis, RequestStatus } from '../src/types';

function record(overrides: Partial<Parameters<Telemetry['record']>[0]> = {}) {
  return {
    requestId: overrides.requestId ?? Math.random().toString(36),
    organizationId: 'org1',
    feature: 'code-review',
    task: 'CODE_ANALYSIS',
    status: RequestStatus.SUCCESS,
    provider: 'mock',
    modelId: 'mock:test-model',
    totalTokens: 100,
    costUsd: 0.01,
    costBasis: CostBasis.ACTUAL,
    totalTimeMs: 500,
    retries: 0,
    cacheHit: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('Telemetry — overview aggregation', () => {
  it('reports genuine zeros/nulls for an empty record set rather than placeholder numbers', () => {
    const t = new Telemetry();
    const overview = t.overview([]);
    expect(overview.totalRequests).toBe(0);
    expect(overview.totalCostUsd).toBeNull();
    expect(overview.failureRate).toBeNull();
    expect(overview.latencyP95).toBeNull();
  });

  it('computes failure rate, fallback rate, and cache hit rate correctly', () => {
    const t = new Telemetry();
    const records = [
      record({ status: RequestStatus.SUCCESS }),
      record({ status: RequestStatus.SUCCESS, cacheHit: true }),
      record({ status: RequestStatus.FALLBACK }),
      record({ status: RequestStatus.FAILED }),
    ];
    const overview = t.overview(records);
    expect(overview.totalRequests).toBe(4);
    expect(overview.failureRate).toBe(0.25);
    expect(overview.fallbackRate).toBe(0.25);
    expect(overview.cacheHitRate).toBe(0.25);
  });

  it('flags mixed actual/estimated cost bases rather than presenting a blended figure as pure fact', () => {
    const t = new Telemetry();
    const records = [record({ costBasis: CostBasis.ACTUAL, costUsd: 0.01 }), record({ costBasis: CostBasis.ESTIMATED, costUsd: 0.02 })];
    const overview = t.overview(records);
    expect(overview.costBasisNote).toBe('MIXED_ACTUAL_AND_ESTIMATED');
    expect(overview.totalCostUsd).toBeCloseTo(0.03);
  });

  it('excludes UNAVAILABLE-basis records from cost totals rather than treating them as zero-cost', () => {
    const t = new Telemetry();
    const records = [record({ costBasis: CostBasis.ACTUAL, costUsd: 0.01 }), record({ costBasis: CostBasis.UNAVAILABLE, costUsd: undefined })];
    const overview = t.overview(records);
    expect(overview.totalCostUsd).toBeCloseTo(0.01);
  });

  it('computes latency percentiles from real recorded values', () => {
    const t = new Telemetry();
    const records = Array.from({ length: 100 }, (_, i) => record({ totalTimeMs: i + 1 }));
    const overview = t.overview(records);
    expect(overview.latencyP50).toBeGreaterThan(40);
    expect(overview.latencyP50).toBeLessThan(60);
    expect(overview.latencyP99).toBeGreaterThan(overview.latencyP50!);
  });
});

describe('Telemetry — breakdownBy', () => {
  it('groups by the requested dimension and sorts by cost descending', () => {
    const t = new Telemetry();
    const records = [
      record({ feature: 'code-review', costUsd: 0.05 }),
      record({ feature: 'code-review', costUsd: 0.05 }),
      record({ feature: 'interview-coach', costUsd: 1.0 }),
    ];
    const breakdown = t.breakdownBy(records, 'feature');
    expect(breakdown[0].key).toBe('interview-coach'); // highest cost first
    expect(breakdown[1].key).toBe('code-review');
    expect(breakdown[1].totalRequests).toBe(2);
  });
});

describe('Telemetry — bucketed (time series)', () => {
  it('groups records into real fixed-width time buckets and omits buckets with no traffic', () => {
    const t = new Telemetry();
    const hourMs = 60 * 60 * 1000;
    const now = Date.now();
    const records = [
      record({ createdAt: new Date(now).toISOString() }),
      record({ createdAt: new Date(now + 5000).toISOString() }), // same hour bucket
      record({ createdAt: new Date(now + hourMs * 3).toISOString() }), // a later, otherwise-empty bucket
    ];

    const buckets = t.bucketed(records, hourMs);

    expect(buckets).toHaveLength(2); // no fabricated zero-filled bucket in between
    expect(buckets[0].totalRequests).toBe(2);
    expect(buckets[1].totalRequests).toBe(1);
    expect(new Date(buckets[0].bucketStart).getTime()).toBeLessThan(new Date(buckets[1].bucketStart).getTime());
  });
});
