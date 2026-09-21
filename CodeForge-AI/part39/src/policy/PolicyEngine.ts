import { config } from '../config';
import { ModelCapability } from '../types';
import { PolicyValidator } from './PolicyValidator';

export enum PolicyScope {
  GLOBAL = 'GLOBAL',
  ORGANIZATION = 'ORGANIZATION',
  FEATURE = 'FEATURE',
  TASK = 'TASK',
}

/**
 * A policy's fields are all optional: an unset field means "defer to the
 * next-less-specific scope", not "no limit". See mergePolicies for exactly
 * how each field behaves when scopes disagree.
 */
export interface PolicyConfig {
  preferredModel?: string;
  /** If set, restricts eligible models. Combined across scopes by INTERSECTION, never union — a child scope can narrow an allowlist but never escape one set by an ancestor. */
  allowedModels?: string[];
  allowedProviders?: string[];
  /** Ordered fallback chain. A more specific scope's list fully replaces a less specific one. */
  fallbackModels?: string[];
  maxCostUsd?: number;
  maxLatencyMs?: number;
  timeoutMs?: number;
  maxRetries?: number;
  maxConcurrency?: number;
  rateLimitPerMinute?: number;
  cachingEnabled?: boolean;
  maxContextTokens?: number;
  qualityRequirement?: 'STANDARD' | 'HIGH';
}

export interface StoredPolicy {
  scope: PolicyScope;
  scopeRef: string | null; // null only for GLOBAL
  config: PolicyConfig;
  version: number;
  isActive: boolean;
  updatedAt: string;
  updatedBy?: string;
}

export interface EffectivePolicy extends Required<Pick<PolicyConfig, 'timeoutMs' | 'maxRetries' | 'maxConcurrency' | 'rateLimitPerMinute' | 'cachingEnabled' | 'maxContextTokens'>> {
  preferredModel?: string;
  allowedModels?: string[];
  allowedProviders?: string[];
  fallbackModels: string[];
  maxCostUsd?: number;
  maxLatencyMs?: number;
  qualityRequirement: 'STANDARD' | 'HIGH';
  /** Which scopes actually contributed a value — for routing explanations and audit. */
  appliedScopes: PolicyScope[];
}

function intersect(a?: string[], b?: string[]): string[] | undefined {
  if (!a) return b;
  if (!b) return a;
  const bSet = new Set(b);
  return a.filter((x) => bSet.has(x));
}

function mergePolicies(base: PolicyConfig, override: PolicyConfig): PolicyConfig {
  return {
    preferredModel: override.preferredModel ?? base.preferredModel,
    allowedModels: override.allowedModels ? intersect(base.allowedModels, override.allowedModels) : base.allowedModels,
    allowedProviders: override.allowedProviders ? intersect(base.allowedProviders, override.allowedProviders) : base.allowedProviders,
    fallbackModels: override.fallbackModels ?? base.fallbackModels,
    maxCostUsd: override.maxCostUsd ?? base.maxCostUsd,
    maxLatencyMs: override.maxLatencyMs ?? base.maxLatencyMs,
    timeoutMs: override.timeoutMs ?? base.timeoutMs,
    maxRetries: override.maxRetries ?? base.maxRetries,
    maxConcurrency: override.maxConcurrency ?? base.maxConcurrency,
    rateLimitPerMinute: override.rateLimitPerMinute ?? base.rateLimitPerMinute,
    cachingEnabled: override.cachingEnabled ?? base.cachingEnabled,
    maxContextTokens: override.maxContextTokens ?? base.maxContextTokens,
    qualityRequirement: override.qualityRequirement ?? base.qualityRequirement,
  };
}

const SAFE_DEFAULT_POLICY: PolicyConfig = {
  timeoutMs: config.safeDefaults.requestTimeoutMs,
  maxRetries: config.safeDefaults.maxRetries,
  maxConcurrency: config.safeDefaults.maxConcurrentPerProvider,
  rateLimitPerMinute: config.safeDefaults.rateLimitPerMinute,
  cachingEnabled: true,
  maxContextTokens: config.safeDefaults.maxContextTokens,
  qualityRequirement: 'STANDARD',
  // Deliberately no allowedModels/fallbackModels/maxCostUsd here — those
  // are populated by ModelRouter/BudgetEngine's own safe-default paths so
  // this file doesn't need to know the full model registry.
};

function keyFor(scope: PolicyScope, scopeRef: string | null): string {
  return `${scope}:${scopeRef ?? ''}`;
}

/**
 * Resolves the GLOBAL -> ORGANIZATION -> FEATURE -> TASK hierarchy into one
 * effective policy per request. Resolution is a pure function of
 * (stored policies, safe defaults) — same inputs always produce the same
 * output, which is what makes routing decisions reproducible.
 */
export class PolicyEngine {
  private policies = new Map<string, StoredPolicy>();
  private validator = new PolicyValidator();

  setPolicy(scope: PolicyScope, scopeRef: string | null, cfg: PolicyConfig, updatedBy?: string, requiredCapabilitiesHint?: ModelCapability[]): StoredPolicy {
    this.validator.validate(cfg, requiredCapabilitiesHint);
    const key = keyFor(scope, scopeRef);
    const existing = this.policies.get(key);
    const stored: StoredPolicy = {
      scope,
      scopeRef,
      config: cfg,
      version: (existing?.version ?? 0) + 1,
      isActive: true,
      updatedAt: new Date().toISOString(),
      updatedBy,
    };
    this.policies.set(key, stored);
    return stored;
  }

  getPolicy(scope: PolicyScope, scopeRef: string | null): StoredPolicy | undefined {
    return this.policies.get(keyFor(scope, scopeRef));
  }

  deactivate(scope: PolicyScope, scopeRef: string | null): void {
    const key = keyFor(scope, scopeRef);
    const existing = this.policies.get(key);
    if (existing) this.policies.set(key, { ...existing, isActive: false });
  }

  listAll(): StoredPolicy[] {
    return [...this.policies.values()];
  }

  resolve(ctx: { organizationId: string; feature: string; task: string }): EffectivePolicy {
    const layers: Array<{ scope: PolicyScope; scopeRef: string | null }> = [
      { scope: PolicyScope.GLOBAL, scopeRef: null },
      { scope: PolicyScope.ORGANIZATION, scopeRef: ctx.organizationId },
      { scope: PolicyScope.FEATURE, scopeRef: ctx.feature },
      { scope: PolicyScope.TASK, scopeRef: ctx.task },
    ];

    let merged: PolicyConfig = { ...SAFE_DEFAULT_POLICY };
    const appliedScopes: PolicyScope[] = [];

    for (const layer of layers) {
      const stored = this.policies.get(keyFor(layer.scope, layer.scopeRef));
      if (stored && stored.isActive) {
        merged = mergePolicies(merged, stored.config);
        appliedScopes.push(layer.scope);
      }
    }

    return {
      preferredModel: merged.preferredModel,
      allowedModels: merged.allowedModels,
      allowedProviders: merged.allowedProviders,
      fallbackModels: merged.fallbackModels ?? [],
      maxCostUsd: merged.maxCostUsd,
      maxLatencyMs: merged.maxLatencyMs,
      timeoutMs: merged.timeoutMs ?? SAFE_DEFAULT_POLICY.timeoutMs!,
      maxRetries: merged.maxRetries ?? SAFE_DEFAULT_POLICY.maxRetries!,
      maxConcurrency: merged.maxConcurrency ?? SAFE_DEFAULT_POLICY.maxConcurrency!,
      rateLimitPerMinute: merged.rateLimitPerMinute ?? SAFE_DEFAULT_POLICY.rateLimitPerMinute!,
      cachingEnabled: merged.cachingEnabled ?? SAFE_DEFAULT_POLICY.cachingEnabled!,
      maxContextTokens: merged.maxContextTokens ?? SAFE_DEFAULT_POLICY.maxContextTokens!,
      qualityRequirement: merged.qualityRequirement ?? 'STANDARD',
      appliedScopes,
    };
  }
}

export const policyEngine = new PolicyEngine();
