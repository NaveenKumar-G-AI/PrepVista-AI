import { recommendNextProof } from '../nextProof';
import { ReadinessGap, ValidationCatalogEntry } from '../../types/domain';

const testingGap: ReadinessGap = {
  capabilityId: 'testing',
  capabilityName: 'Testing',
  requiredLevel: 'INTERMEDIATE',
  currentLabel: 'LIMITED',
  importance: 2,
  distance: 1,
};

const systemDesignGap: ReadinessGap = {
  capabilityId: 'system_design',
  capabilityName: 'System Design',
  requiredLevel: 'BASIC',
  currentLabel: 'UNKNOWN',
  importance: 1,
  distance: 1,
};

describe('recommendNextProof', () => {
  it('returns null when there are no gaps', () => {
    expect(recommendNextProof([])).toBeNull();
  });

  it('always targets the first (highest-ranked) gap in the list', () => {
    const rec = recommendNextProof([testingGap, systemDesignGap]);
    expect(rec?.capabilityId).toBe('testing');
  });

  it('prefers a real catalog entry over the generic fallback', () => {
    const catalog: ValidationCatalogEntry[] = [
      {
        capabilityId: 'testing',
        validationType: 'SIMULATION',
        title: 'Backend testing simulation',
        description: 'Write and defend a test suite for a small service under time pressure.',
        ctaLabel: 'Prove this',
        actionRef: 'sim_backend_testing_001',
      },
    ];
    const rec = recommendNextProof([testingGap], catalog);
    expect(rec?.headline).toBe('Backend testing simulation');
    expect(rec?.actionRef).toBe('sim_backend_testing_001');
  });

  it('falls back to a generic, still-honest recommendation when no catalog entry exists', () => {
    const rec = recommendNextProof([testingGap], []);
    expect(rec?.headline).toMatch(/Validate Testing/i);
    expect(rec?.description).toMatch(/limited/i);
    expect(rec?.actionRef).toBeUndefined();
  });
});
