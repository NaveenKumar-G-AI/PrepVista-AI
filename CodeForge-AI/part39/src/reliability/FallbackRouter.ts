import { EffectivePolicy } from '../policy/PolicyEngine';
import { ModelRegistry } from '../registry/ModelRegistry';
import { ModelCapability, ModelDescriptor, ModelStatus, ProviderHealthStatus } from '../types';
import { CircuitBreaker, CircuitBreakerOptions } from './CircuitBreaker';

/**
 * Picks the next model to try after a failure, walking the policy's
 * ordered fallback chain and skipping anything that can't actually serve
 * the task (wrong capability, disabled, unhealthy provider, open
 * circuit) or that already failed in this same request. Returns null when
 * nothing usable remains, which the gateway treats as DEGRADED MODE
 * rather than an unhandled crash.
 *
 * Quality is not sacrificed silently: a fallback is only ever offered if
 * it satisfies the SAME required-capability set as the primary model, so
 * a complex-reasoning task never silently drops to an incapable model
 * just because it was cheaper or first in a list.
 */
export class FallbackRouter {
  constructor(private registry: ModelRegistry, private circuitBreaker: CircuitBreaker, private circuitOptions: CircuitBreakerOptions, private getProviderHealth: (provider: string) => ProviderHealthStatus) {}

  next(requiredCapabilities: ModelCapability[], policy: EffectivePolicy, alreadyTried: Set<string>): ModelDescriptor | null {
    for (const modelId of policy.fallbackModels) {
      if (alreadyTried.has(modelId)) continue;

      const model = this.registry.get(modelId);
      if (!model) continue;
      if (model.status !== ModelStatus.ACTIVE) continue;
      if (!requiredCapabilities.every((cap) => model.capabilities.includes(cap))) continue;

      const providerHealth = this.getProviderHealth(model.provider);
      if (providerHealth === ProviderHealthStatus.UNAVAILABLE || providerHealth === ProviderHealthStatus.DISABLED) continue;

      if (this.circuitBreaker.state(`${model.provider}:${model.modelKey}`) === 'OPEN') continue;

      return model;
    }
    return null;
  }
}
