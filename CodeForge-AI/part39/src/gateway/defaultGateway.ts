import { budgetEngine } from '../budget/BudgetEngine';
import { quotaEngine } from '../budget/QuotaEngine';
import { cacheLayer } from '../cache/CacheLayer';
import { contextManager } from '../context/ContextManager';
import { costCalculator } from '../cost/CostCalculator';
import { policyEngine } from '../policy/PolicyEngine';
import { providerRegistry } from '../providers/ProviderRegistry';
import { ProviderHealthCache } from '../providers/ProviderHealthCache';
import { modelRegistry } from '../registry/ModelRegistry';
import { circuitBreaker } from '../reliability/CircuitBreaker';
import { FallbackRouter } from '../reliability/FallbackRouter';
import { retryEngine } from '../reliability/RetryEngine';
import { ModelRouter } from '../routing/ModelRouter';
import { auditLog } from '../telemetry/AuditLog';
import { telemetry } from '../telemetry/Telemetry';
import { concurrencyController } from '../traffic/ConcurrencyController';
import { rateLimiter } from '../traffic/RateLimiter';
import { ProviderHealthStatus } from '../types';
import { AIGateway } from './AIGateway';
import { emergencyControls } from './EmergencyControls';

export const providerHealthCache = new ProviderHealthCache(providerRegistry);

function getProviderHealth(providerName: string): ProviderHealthStatus {
  if (emergencyControls.isProviderDisabled(providerName)) return ProviderHealthStatus.DISABLED;
  return providerHealthCache.getStatus(providerName);
}

function getCircuitState(key: string) {
  return circuitBreaker.state(key);
}

export const modelRouter = new ModelRouter(modelRegistry, getProviderHealth, getCircuitState);

export const fallbackRouter = new FallbackRouter(modelRegistry, circuitBreaker, { failureThreshold: 5, windowMs: 60_000, cooldownMs: 30_000 }, getProviderHealth);

/**
 * The default, fully-wired gateway instance using real (non-test-double)
 * singletons. This is what api/routes/execute.ts calls. Tests instead
 * construct their own AIGateway with fakes injected — see AIGatewayDeps.
 */
export const aiGateway = new AIGateway({
  policyEngine,
  modelRegistry,
  providerRegistry,
  providerHealthCache,
  modelRouter,
  fallbackRouter,
  budgetEngine,
  quotaEngine,
  rateLimiter,
  concurrencyController,
  retryEngine,
  circuitBreaker,
  cacheLayer,
  contextManager,
  costCalculator,
  telemetry,
  auditLog,
  emergencyControls,
});
