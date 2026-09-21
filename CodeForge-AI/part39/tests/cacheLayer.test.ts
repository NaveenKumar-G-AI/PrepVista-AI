import { CacheLayer } from '../src/cache/CacheLayer';
import { CacheScope } from '../src/types';

const baseParams = {
  organizationId: 'org1',
  task: 'CODE_ANALYSIS',
  inputHash: CacheLayer.hashInput('same input for everyone'),
  modelId: 'anthropic:claude-sonnet-5',
  promptVersion: 'v1',
  policyVersion: 1,
};

describe('CacheLayer — GOLDEN CACHE TEST (isolation)', () => {
  it('never builds a USER-scope key without a user id', () => {
    const cache = new CacheLayer();
    const key = cache.buildKey({ ...baseParams, scope: CacheScope.USER, userId: undefined });
    expect(key).toBeNull();
  });

  it('two different users at USER scope get different, non-colliding keys for identical input', () => {
    const cache = new CacheLayer();
    const keyA = cache.buildKey({ ...baseParams, scope: CacheScope.USER, userId: 'student-a' });
    const keyB = cache.buildKey({ ...baseParams, scope: CacheScope.USER, userId: 'student-b' });

    expect(keyA).not.toBeNull();
    expect(keyB).not.toBeNull();
    expect(keyA).not.toBe(keyB);

    cache.set(keyA!, 'student A only', 60_000);
    expect(cache.get(keyB!)).toBeUndefined(); // student B cannot see student A's cached response
    expect(cache.get(keyA!)).toBe('student A only');
  });

  it('two different organizations at TENANT scope get different keys for identical input', () => {
    const cache = new CacheLayer();
    const keyOrgA = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, organizationId: 'org-a' });
    const keyOrgB = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, organizationId: 'org-b' });

    expect(keyOrgA).not.toBe(keyOrgB);
    cache.set(keyOrgA!, 'org A data', 60_000);
    expect(cache.get(keyOrgB!)).toBeUndefined();
  });

  it('CacheScope.NONE never produces a cacheable key', () => {
    const cache = new CacheLayer();
    expect(cache.buildKey({ ...baseParams, scope: CacheScope.NONE, userId: 'anyone' })).toBeNull();
  });
});

describe('CacheLayer — versioning', () => {
  it('a different promptVersion produces a different key (old cache entries are not reused under a new prompt)', () => {
    const cache = new CacheLayer();
    const keyV1 = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, promptVersion: 'v1' });
    const keyV2 = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, promptVersion: 'v2' });
    expect(keyV1).not.toBe(keyV2);
  });

  it('a different policyVersion produces a different key', () => {
    const cache = new CacheLayer();
    const keyP1 = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, policyVersion: 1 });
    const keyP2 = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, policyVersion: 2 });
    expect(keyP1).not.toBe(keyP2);
  });

  it('a different model id produces a different key', () => {
    const cache = new CacheLayer();
    const keyA = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, modelId: 'model-a' });
    const keyB = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT, modelId: 'model-b' });
    expect(keyA).not.toBe(keyB);
  });
});

describe('CacheLayer — stats and expiry', () => {
  it('tracks hit rate correctly', () => {
    const cache = new CacheLayer();
    const key = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT })!;
    cache.get(key); // miss
    cache.set(key, 'value', 60_000);
    cache.get(key); // hit
    cache.get(key); // hit

    const stats = cache.getStats();
    expect(stats.hits).toBe(2);
    expect(stats.misses).toBe(1);
    expect(stats.hitRate).toBeCloseTo(2 / 3);
  });

  it('expires entries after their TTL and counts it as an eviction', async () => {
    const cache = new CacheLayer();
    const key = cache.buildKey({ ...baseParams, scope: CacheScope.TENANT })!;
    cache.set(key, 'value', 10);
    await new Promise((r) => setTimeout(r, 25));

    expect(cache.get(key)).toBeUndefined();
    expect(cache.getStats().evictions).toBe(1);
  });

  it('only reports cost savings that were explicitly recorded on a real hit', () => {
    const cache = new CacheLayer();
    expect(cache.getStats().estimatedSavedUsd).toBe(0);
    cache.recordSavedCost(0.05);
    expect(cache.getStats().estimatedSavedUsd).toBeCloseTo(0.05);
  });
});
