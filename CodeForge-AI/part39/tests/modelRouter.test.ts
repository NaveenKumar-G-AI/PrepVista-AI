import { PolicyScope, PolicyEngine } from '../src/policy/PolicyEngine';
import { ModelRegistry } from '../src/registry/ModelRegistry';
import { ModelRouter } from '../src/routing/ModelRouter';
import { ModelCapability, ModelDescriptor, ModelStatus, ProviderHealthStatus, RoutingReason } from '../src/types';

function model(overrides: Partial<ModelDescriptor> & Pick<ModelDescriptor, 'id' | 'capabilities'>): ModelDescriptor {
  return {
    provider: 'test-provider',
    modelKey: overrides.id,
    family: 'test',
    contextWindow: 100_000,
    maxOutputTokens: 4096,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 1, outputPricePerMTok: 1, pricingVersion: 1, pricingAsOf: '2026-01-01', pricingSource: 'test' },
    ...overrides,
  };
}

const cheapFast = model({ id: 'cheap-fast', capabilities: [ModelCapability.GENERAL, ModelCapability.FAST], pricing: { inputPricePerMTok: 0.5, outputPricePerMTok: 2, pricingVersion: 1, pricingAsOf: '2026-01-01', pricingSource: 'test' } });
const midReasoning = model({ id: 'mid-reasoning', capabilities: [ModelCapability.GENERAL, ModelCapability.REASONING], pricing: { inputPricePerMTok: 2, outputPricePerMTok: 10, pricingVersion: 1, pricingAsOf: '2026-01-01', pricingSource: 'test' } });
const expensiveReasoning = model({ id: 'expensive-reasoning', capabilities: [ModelCapability.GENERAL, ModelCapability.REASONING], pricing: { inputPricePerMTok: 10, outputPricePerMTok: 50, pricingVersion: 1, pricingAsOf: '2026-01-01', pricingSource: 'test' } });
const embeddingOnly = model({ id: 'embedding-only', capabilities: [ModelCapability.EMBEDDING] });

function buildRouter(models: ModelDescriptor[], opts: { health?: ProviderHealthStatus; circuit?: 'CLOSED' | 'OPEN' | 'HALF_OPEN' } = {}) {
  const registry = new ModelRegistry(models);
  const router = new ModelRouter(
    registry,
    () => opts.health ?? ProviderHealthStatus.HEALTHY,
    () => opts.circuit ?? 'CLOSED'
  );
  return { registry, router };
}

function effectivePolicy(overrides: Partial<ReturnType<PolicyEngine['resolve']>> = {}) {
  const engine = new PolicyEngine();
  return { ...engine.resolve({ organizationId: 'org1', feature: 'f', task: 'GENERIC' }), ...overrides };
}

describe('ModelRouter — GOLDEN ROUTING TEST', () => {
  it('does not automatically select the most expensive model for a standard task', () => {
    const { router } = buildRouter([cheapFast, expensiveReasoning]);
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL] }, effectivePolicy());

    expect(decision.model?.id).toBe('cheap-fast');
    expect(decision.reasons).toContain(RoutingReason.CAPABILITY_MATCH);
  });

  it('picks a REASONING-capable model when the task requires it, even though it costs more', () => {
    const { router } = buildRouter([cheapFast, expensiveReasoning]);
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL, ModelCapability.REASONING] }, effectivePolicy());

    expect(decision.model?.id).toBe('expensive-reasoning'); // only eligible model with REASONING
  });

  it('among multiple capability-satisfying models for a HIGH quality request, still prefers the cheaper one', () => {
    const { router } = buildRouter([midReasoning, expensiveReasoning]);
    const decision = router.route(
      { organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.REASONING], qualityRequirement: 'HIGH' },
      effectivePolicy()
    );
    expect(decision.model?.id).toBe('mid-reasoning');
  });

  it('returns NO_ELIGIBLE_MODEL when nothing supports the required capability', () => {
    const { router } = buildRouter([cheapFast, expensiveReasoning]);
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.EMBEDDING] }, effectivePolicy());

    expect(decision.model).toBeNull();
    expect(decision.reasons).toEqual([RoutingReason.NO_ELIGIBLE_MODEL]);
  });
});

describe('ModelRouter — determinism', () => {
  it('returns the identical model across repeated calls with identical inputs', () => {
    const { router } = buildRouter([cheapFast, midReasoning, expensiveReasoning]);
    const ctx = { organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL] };
    const policy = effectivePolicy();

    const results = Array.from({ length: 20 }, () => router.route(ctx, policy).model?.id);
    expect(new Set(results).size).toBe(1);
  });
});

describe('ModelRouter — health and circuit exclusion', () => {
  it('excludes models whose provider is UNAVAILABLE', () => {
    const { router } = buildRouter([cheapFast], { health: ProviderHealthStatus.UNAVAILABLE });
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL] }, effectivePolicy());
    expect(decision.model).toBeNull();
  });

  it('excludes models whose circuit is OPEN', () => {
    const { router } = buildRouter([cheapFast], { circuit: 'OPEN' });
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL] }, effectivePolicy());
    expect(decision.model).toBeNull();
  });

  it('excludes DEPRECATED/DISABLED models', () => {
    const deprecated = { ...cheapFast, status: ModelStatus.DEPRECATED };
    const { router } = buildRouter([deprecated]);
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL] }, effectivePolicy());
    expect(decision.model).toBeNull();
  });
});

describe('ModelRouter — policy constraints', () => {
  it('honors preferredModel when it is eligible', () => {
    const { router } = buildRouter([cheapFast, midReasoning]);
    const policy = effectivePolicy({ preferredModel: 'mid-reasoning' });
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.GENERAL] }, policy);
    expect(decision.model?.id).toBe('mid-reasoning');
    expect(decision.reasons).toContain(RoutingReason.PREFERRED_MODEL);
  });

  it('falls through to normal scoring when preferredModel is not eligible for the required capability', () => {
    const { router } = buildRouter([cheapFast, midReasoning]);
    const policy = effectivePolicy({ preferredModel: 'cheap-fast' }); // lacks REASONING
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.REASONING] }, policy);
    expect(decision.model?.id).toBe('mid-reasoning');
  });

  it('restricts eligibility to allowedModels', () => {
    const { router } = buildRouter([cheapFast, midReasoning]);
    const policy = effectivePolicy({ allowedModels: ['cheap-fast'] });
    const decision = router.route({ organizationId: 'org1', task: 'GENERIC' as any, requiredCapabilities: [ModelCapability.REASONING] }, policy);
    // midReasoning is the only model with REASONING, but it's excluded by allowedModels.
    expect(decision.model).toBeNull();
  });
});
