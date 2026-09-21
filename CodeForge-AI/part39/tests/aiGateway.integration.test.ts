import { randomUUID } from 'crypto';
import { BudgetEngine, BudgetScope } from '../src/budget/BudgetEngine';
import { QuotaEngine } from '../src/budget/QuotaEngine';
import { CacheLayer } from '../src/cache/CacheLayer';
import { ContextManager } from '../src/context/ContextManager';
import { CostCalculator } from '../src/cost/CostCalculator';
import { AIGateway, AIGatewayDeps } from '../src/gateway/AIGateway';
import { EmergencyControls } from '../src/gateway/EmergencyControls';
import { PolicyEngine } from '../src/policy/PolicyEngine';
import { MockProvider } from '../src/providers/MockProvider';
import { ProviderHealthCache } from '../src/providers/ProviderHealthCache';
import { ProviderRegistry } from '../src/providers/ProviderRegistry';
import { ModelRegistry } from '../src/registry/ModelRegistry';
import { seedModels } from '../src/registry/seedModels';
import { CircuitBreaker } from '../src/reliability/CircuitBreaker';
import { FallbackRouter } from '../src/reliability/FallbackRouter';
import { RetryEngine } from '../src/reliability/RetryEngine';
import { ModelRouter } from '../src/routing/ModelRouter';
import { AuditLog } from '../src/telemetry/AuditLog';
import { Telemetry } from '../src/telemetry/Telemetry';
import { ConcurrencyController } from '../src/traffic/ConcurrencyController';
import { RateLimiter } from '../src/traffic/RateLimiter';
import { CacheScope, ModelCapability, ModelDescriptor, ModelStatus, Priority, ProviderHealthStatus, RequestStatus, TaskType } from '../src/types';

/**
 * A non-zero-priced model backed by the same zero-network-cost
 * MockProvider, used only where a test needs budget math to actually bite
 * (the seeded `mock:test-model` is intentionally $0 — see seedModels.ts —
 * so it can never demonstrate a real budget block on its own).
 */
const PRICED_TEST_MODEL: ModelDescriptor = {
  id: 'mock:priced-test-model',
  provider: 'mock',
  modelKey: 'priced-test-model',
  family: 'mock',
  capabilities: [ModelCapability.GENERAL],
  contextWindow: 32_000,
  maxOutputTokens: 4_096,
  status: ModelStatus.ACTIVE,
  pricing: { inputPricePerMTok: 1000, outputPricePerMTok: 1000, pricingVersion: 1, pricingAsOf: '2026-01-01', pricingSource: 'test fixture — not a real price' },
};

/**
 * Builds a fully independent AIGateway (fresh instances of every
 * dependency, never the app's shared singletons) so tests can't leak
 * state into each other, and returns the individual deps alongside it so
 * tests can set up budgets/policies/etc. directly instead of reaching
 * into the gateway's internals.
 */
function buildTestGateway(models: ModelDescriptor[] = seedModels) {
  const modelRegistry = new ModelRegistry(models);
  const providerRegistry = new ProviderRegistry([new MockProvider()]);
  const providerHealthCache = new ProviderHealthCache(providerRegistry);
  const circuitBreakerInstance = new CircuitBreaker();
  const emergencyControls = new EmergencyControls();

  const getProviderHealth = () => ProviderHealthStatus.HEALTHY; // mock provider is always healthy
  const getCircuitState = (key: string) => circuitBreakerInstance.state(key);

  const modelRouter = new ModelRouter(modelRegistry, getProviderHealth, getCircuitState);
  const fallbackRouter = new FallbackRouter(modelRegistry, circuitBreakerInstance, { failureThreshold: 5, windowMs: 60_000, cooldownMs: 30_000 }, getProviderHealth);

  const deps: AIGatewayDeps = {
    policyEngine: new PolicyEngine(),
    modelRegistry,
    providerRegistry,
    providerHealthCache,
    modelRouter,
    fallbackRouter,
    budgetEngine: new BudgetEngine(),
    quotaEngine: new QuotaEngine(),
    rateLimiter: new RateLimiter(),
    concurrencyController: new ConcurrencyController(),
    retryEngine: new RetryEngine(),
    circuitBreaker: circuitBreakerInstance,
    cacheLayer: new CacheLayer(),
    contextManager: new ContextManager(),
    costCalculator: new CostCalculator(),
    telemetry: new Telemetry(),
    auditLog: new AuditLog(),
    emergencyControls,
  };

  return { gateway: new AIGateway(deps), deps, emergencyControls };
}

function baseCtx(overrides: Partial<Parameters<AIGateway['execute']>[0]> = {}) {
  return {
    requestId: randomUUID(),
    organizationId: 'org1',
    userId: 'user1',
    feature: 'code-review',
    task: TaskType.CODE_ANALYSIS,
    priority: Priority.INTERACTIVE,
    requiredCapabilities: [ModelCapability.GENERAL],
    messages: [{ role: 'user' as const, content: 'Review this function for bugs.' }],
    ...overrides,
  };
}

describe('AIGateway — end-to-end integration (mock provider)', () => {
  it('a normal request succeeds and produces usage, cost, and a selected model', async () => {
    const { gateway } = buildTestGateway();
    const result = await gateway.execute(baseCtx());

    expect(result.status).toBe(RequestStatus.SUCCESS);
    expect(result.text).toBeTruthy();
    expect(result.usage?.totalTokens).toBeGreaterThan(0);
    expect(result.model?.provider).toBe('mock');
    expect(result.costUsd).toBe(0); // the default seeded mock model is priced at $0
    expect(result.publicError).toBeUndefined();
  });

  it('an identical idempotency key returns the exact same result without executing twice', async () => {
    const { gateway } = buildTestGateway();
    const key = 'idem-test-1';
    const first = await gateway.execute(baseCtx({ idempotencyKey: key }));
    const second = await gateway.execute(baseCtx({ idempotencyKey: key, messages: [{ role: 'user', content: 'a completely different message' }] }));

    expect(second.requestId).toBe(first.requestId);
    expect(second.text).toBe(first.text);
  });

  it('GOLDEN BUDGET TEST: once the org budget is exhausted, the gateway blocks further requests end-to-end', async () => {
    const { gateway, deps } = buildTestGateway([PRICED_TEST_MODEL]);
    deps.budgetEngine.upsertBudget({
      scope: BudgetScope.ORGANIZATION,
      scopeRef: 'org1',
      period: 'DAILY',
      limitUsd: 0.05,
      warningThresholdPct: 80,
      hardLimit: true,
      periodStart: new Date().toISOString(),
      periodEnd: new Date(Date.now() + 86_400_000).toISOString(),
    });

    // maxOutputTokens is capped small and below the mock's natural reply
    // length, so MockProvider's actual usage gets token-capped to exactly
    // this ceiling — meaning the pre-flight estimate and the post-call
    // actual cost land on (approximately) the same number, and budget
    // depletion per call is predictable rather than dependent on exactly
    // how much the estimate overshot the real usage.
    const request = () => gateway.execute(baseCtx({ requiredCapabilities: [ModelCapability.GENERAL], maxOutputTokens: 10, cacheScope: CacheScope.NONE }));

    const first = await request();
    expect(first.status).toBe(RequestStatus.SUCCESS); // first request fits inside the budget

    // Drain the rest of the budget with more requests until one is blocked.
    let blocked;
    for (let i = 0; i < 20 && !blocked; i++) {
      const r = await request();
      if (r.status === RequestStatus.BLOCKED) blocked = r;
    }

    expect(blocked).toBeDefined();
    expect(blocked!.publicError?.category).toBe('BUDGET_LIMIT');
    // The org budget must never show more used than its configured limit.
    expect(deps.budgetEngine.getBudget(BudgetScope.ORGANIZATION, 'org1')!.usedUsd).toBeLessThanOrEqual(0.05);
  });

  it('kill switch blocks every request with a structured BLOCKED result, not a thrown exception', async () => {
    const { gateway, emergencyControls } = buildTestGateway();
    emergencyControls.activateKillSwitch('incident-1234');

    const result = await gateway.execute(baseCtx());

    expect(result.status).toBe(RequestStatus.BLOCKED);
    expect(result.publicError?.category).toBe('POLICY_REJECTION');
  });

  it('a disabled task is blocked while other tasks continue to work normally', async () => {
    const { gateway, emergencyControls } = buildTestGateway();
    emergencyControls.disableTask(TaskType.CODE_ANALYSIS);

    const disabled = await gateway.execute(baseCtx({ task: TaskType.CODE_ANALYSIS }));
    const stillWorks = await gateway.execute(baseCtx({ task: TaskType.CLASSIFICATION }));

    expect(disabled.status).toBe(RequestStatus.BLOCKED);
    expect(stillWorks.status).toBe(RequestStatus.SUCCESS);
  });

  it('a disabled provider makes the gateway fail closed rather than silently routing through it anyway', async () => {
    const { gateway, emergencyControls } = buildTestGateway();
    emergencyControls.disableProvider('mock');

    const result = await gateway.execute(baseCtx());

    // mock is the only provider in this test's registry, so with it
    // disabled there is nothing left to route to.
    expect(result.status).toBe(RequestStatus.FAILED);
  });

  it('GOLDEN CACHE TEST: an identical CLASSIFICATION request from the same org hits the cache on the second call', async () => {
    const { gateway } = buildTestGateway();
    const ctx = baseCtx({ task: TaskType.CLASSIFICATION, messages: [{ role: 'user', content: 'classify: is this spam?' }] });

    const first = await gateway.execute({ ...ctx, requestId: randomUUID() });
    const second = await gateway.execute({ ...ctx, requestId: randomUUID() });

    expect(first.cacheHit).toBe(false);
    expect(second.cacheHit).toBe(true);
    expect(second.text).toBe(first.text);
  });

  it('GOLDEN PRIVACY TEST: a USER-scoped cacheable task never leaks a cached response across users', async () => {
    const { gateway } = buildTestGateway();
    const ctxFor = (userId: string) =>
      baseCtx({ userId, task: TaskType.CODE_ANALYSIS, cacheScope: CacheScope.USER, messages: [{ role: 'user', content: 'review the same snippet' }] });

    const studentA = await gateway.execute(ctxFor('student-a'));
    const studentB = await gateway.execute(ctxFor('student-b'));

    expect(studentA.cacheHit).toBe(false);
    expect(studentB.cacheHit).toBe(false); // must NOT hit student A's cache entry despite identical input
  });

  it('rejects an oversized request via context management rather than sending it to the provider', async () => {
    const { gateway } = buildTestGateway();
    const hugeMessage = 'x'.repeat(2_000_000); // far beyond the safe-default context budget
    const result = await gateway.execute(baseCtx({ messages: [{ role: 'user', content: hugeMessage }] }));

    expect(result.status).toBe(RequestStatus.FAILED);
    expect(result.publicError?.category).toBe('INVALID_REQUEST');
  });

  it('GOLDEN OUTAGE TEST: after enough failures the circuit opens and further calls fail fast without hitting the provider again', async () => {
    const { gateway } = buildTestGateway([PRICED_TEST_MODEL]);
    const realGenerate = MockProvider.prototype.generate;
    let callCount = 0;
    // Force every call to fail, simulating a provider outage.
    MockProvider.prototype.generate = async function () {
      callCount++;
      throw new Error('simulated provider timeout');
    };

    try {
      for (let i = 0; i < 6; i++) {
        await gateway.execute(baseCtx({ requiredCapabilities: [ModelCapability.GENERAL] }));
      }
      const callsOnceCircuitShouldBeOpen = callCount;
      await gateway.execute(baseCtx({ requiredCapabilities: [ModelCapability.GENERAL] }));

      // Once OPEN, the circuit breaker must short-circuit before ever
      // reaching the provider again — call count should not grow.
      expect(callCount).toBe(callsOnceCircuitShouldBeOpen);
    } finally {
      MockProvider.prototype.generate = realGenerate;
    }
  });
});
