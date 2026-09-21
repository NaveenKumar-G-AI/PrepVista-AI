import { EffectivePolicy } from '../policy/PolicyEngine';
import { ModelRegistry } from '../registry/ModelRegistry';
import { AIRequestContext, ModelCapability, ModelDescriptor, ModelStatus, ProviderHealthStatus, RoutingDecision, RoutingReason } from '../types';

export interface ProviderHealthLookup {
  (providerName: string): ProviderHealthStatus;
}

export interface CircuitStateLookup {
  (key: string): 'CLOSED' | 'OPEN' | 'HALF_OPEN';
}

/**
 * Deterministic hash used ONLY for experiment bucketing (see
 * assignExperimentArm). Never used for anything security-sensitive.
 */
function stableHash(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface ExperimentConfig {
  key: string;
  armModelIds: string[];
  /** Fraction (0-1) of eligible traffic assigned to the experiment at all; the rest uses normal routing. */
  trafficFraction: number;
}

/**
 * Turns (task requirements + effective policy + model registry + live
 * health/circuit state) into a single routing decision. Given identical
 * inputs, this always returns the identical model — see
 * tests/modelRouter.test.ts's determinism test. The only source of
 * per-request variation is an explicitly configured experiment, and even
 * that is deterministic per (tenant, task) via stableHash rather than
 * Math.random(), so a given org always lands in the same arm.
 */
export class ModelRouter {
  constructor(private registry: ModelRegistry, private getProviderHealth: ProviderHealthLookup, private getCircuitState: CircuitStateLookup) {}

  route(ctx: Pick<AIRequestContext, 'organizationId' | 'task' | 'requiredCapabilities' | 'qualityRequirement' | 'maxCostUsd' | 'maxLatencyMs'>, policy: EffectivePolicy, experiment?: ExperimentConfig): RoutingDecision {
    const reasons: RoutingReason[] = [];
    const candidatesConsidered: string[] = [];

    const eligible = this.eligibleModels(ctx.requiredCapabilities, policy, candidatesConsidered);

    if (eligible.length === 0) {
      return { model: null, reasons: [RoutingReason.NO_ELIGIBLE_MODEL], candidatesConsidered, fallbackChain: policy.fallbackModels };
    }

    // Experiment assignment takes priority when configured and the org
    // falls into the experiment's traffic slice — but only among models
    // that are already eligible, so an experiment can never bypass policy.
    if (experiment) {
      const bucket = stableHash(`${experiment.key}:${ctx.organizationId}:${ctx.task}`) / 0xffffffff;
      if (bucket < experiment.trafficFraction) {
        const armModel = eligible.find((m) => experiment.armModelIds.includes(m.id));
        if (armModel) {
          reasons.push(RoutingReason.EXPERIMENT_ASSIGNMENT);
          return { model: armModel, reasons, candidatesConsidered, fallbackChain: policy.fallbackModels };
        }
      }
    }

    // Preferred model wins if it's eligible.
    if (policy.preferredModel) {
      const preferred = eligible.find((m) => m.id === policy.preferredModel);
      if (preferred) {
        reasons.push(RoutingReason.PREFERRED_MODEL);
        return { model: preferred, reasons, candidatesConsidered, fallbackChain: policy.fallbackModels };
      }
    }

    const scored = eligible
      .map((model) => ({ model, score: this.score(model, ctx, policy) }))
      .sort((a, b) => b.score - a.score || a.model.id.localeCompare(b.model.id)); // stable tiebreak by id

    reasons.push(RoutingReason.CAPABILITY_MATCH);
    if (ctx.maxCostUsd !== undefined || policy.maxCostUsd !== undefined) reasons.push(RoutingReason.COST_CONSTRAINT);
    if (ctx.maxLatencyMs !== undefined || policy.maxLatencyMs !== undefined) reasons.push(RoutingReason.LATENCY_REQUIREMENT);

    return { model: scored[0].model, reasons, candidatesConsidered, fallbackChain: policy.fallbackModels };
  }

  /** Used by FallbackRouter after a primary model fails. */
  eligibleModels(required: ModelCapability[], policy: EffectivePolicy, candidatesConsidered: string[] = []): ModelDescriptor[] {
    const allowedProviders = policy.allowedProviders ? new Set(policy.allowedProviders) : undefined;
    const allowedModels = policy.allowedModels ? new Set(policy.allowedModels) : undefined;

    return this.registry.listActive().filter((m) => {
      candidatesConsidered.push(m.id);
      if (allowedModels && !allowedModels.has(m.id)) return false;
      if (allowedProviders && !allowedProviders.has(m.provider)) return false;
      if (!required.every((cap) => m.capabilities.includes(cap))) return false;
      if (m.status !== ModelStatus.ACTIVE) return false;

      const providerHealth = this.getProviderHealth(m.provider);
      if (providerHealth === ProviderHealthStatus.UNAVAILABLE || providerHealth === ProviderHealthStatus.DISABLED) return false;

      const circuit = this.getCircuitState(`${m.provider}:${m.modelKey}`);
      if (circuit === 'OPEN') return false;

      return true;
    });
  }

  private score(model: ModelDescriptor, ctx: Pick<AIRequestContext, 'qualityRequirement' | 'maxCostUsd' | 'maxLatencyMs'>, policy: EffectivePolicy): number {
    let score = 0;

    // Quality requirement: HIGH prefers REASONING-capable models, but cost
    // still breaks ties among equally-qualified models — a HIGH-quality
    // request should not default to the priciest reasoning model when a
    // cheaper one satisfies the same capability bar.
    const wantsHighQuality = ctx.qualityRequirement === 'HIGH' || policy.qualityRequirement === 'HIGH';
    const blendedCost = model.pricing.inputPricePerMTok + model.pricing.outputPricePerMTok;
    if (wantsHighQuality) {
      if (model.capabilities.includes(ModelCapability.REASONING)) score += 50;
      score += Math.max(0, 10 - blendedCost * 0.1); // secondary, smaller cost preference
    } else {
      // For standard-quality tasks, cheaper is better — this is the
      // "don't automatically pick the most expensive model" requirement.
      score += Math.max(0, 40 - blendedCost); // cheaper models score higher, floor at 0
    }

    // Hard constraints act as disqualifiers, not just tiebreakers.
    const costCap = ctx.maxCostUsd ?? policy.maxCostUsd;
    if (costCap !== undefined) {
      // Rough per-request cost estimate assuming a modest 1k/0.5k token exchange, just for ranking purposes.
      const estRequestCost = (1000 / 1_000_000) * model.pricing.inputPricePerMTok + (500 / 1_000_000) * model.pricing.outputPricePerMTok;
      if (estRequestCost > costCap) score -= 1000;
    }

    const latencyCap = ctx.maxLatencyMs ?? policy.maxLatencyMs;
    if (latencyCap !== undefined && model.observedAvgLatencyMs !== undefined && model.observedAvgLatencyMs > latencyCap) {
      score -= 1000;
    }

    // Slight preference for models with observed telemetry (known quantity) over untested ones.
    if (model.observedAvgLatencyMs !== undefined) score += 1;

    return score;
  }
}
