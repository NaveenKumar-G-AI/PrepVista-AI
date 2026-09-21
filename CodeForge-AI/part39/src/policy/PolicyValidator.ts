import { modelRegistry } from '../registry/ModelRegistry';
import { ModelCapability } from '../types';
import { PolicyConfig } from './PolicyEngine';

export class PolicyValidationError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid policy configuration: ${issues.join('; ')}`);
    this.name = 'PolicyValidationError';
  }
}

const MAX_SANE_RETRIES = 8;
const MAX_SANE_TIMEOUT_MS = 5 * 60_000;
const MAX_SANE_CONTEXT_TOKENS = 2_000_000;

/**
 * Rejects a policy before it can become active. Every check here maps
 * directly to a "golden test" in tests/policyEngine.test.ts.
 */
export class PolicyValidator {
  validate(cfg: PolicyConfig, requiredCapabilitiesHint?: ModelCapability[]): void {
    const issues: string[] = [];

    // --- Numeric sanity -----------------------------------------------
    if (cfg.timeoutMs !== undefined && (cfg.timeoutMs <= 0 || cfg.timeoutMs > MAX_SANE_TIMEOUT_MS)) {
      issues.push(`timeoutMs must be between 1 and ${MAX_SANE_TIMEOUT_MS}`);
    }
    if (cfg.maxRetries !== undefined && (cfg.maxRetries < 0 || cfg.maxRetries > MAX_SANE_RETRIES)) {
      issues.push(`maxRetries must be between 0 and ${MAX_SANE_RETRIES}`);
    }
    if (cfg.maxConcurrency !== undefined && cfg.maxConcurrency <= 0) {
      issues.push('maxConcurrency must be positive');
    }
    if (cfg.rateLimitPerMinute !== undefined && cfg.rateLimitPerMinute <= 0) {
      issues.push('rateLimitPerMinute must be positive');
    }
    if (cfg.maxCostUsd !== undefined && cfg.maxCostUsd <= 0) {
      issues.push('maxCostUsd must be positive');
    }
    if (cfg.maxLatencyMs !== undefined && cfg.maxLatencyMs <= 0) {
      issues.push('maxLatencyMs must be positive');
    }
    if (cfg.maxContextTokens !== undefined && (cfg.maxContextTokens <= 0 || cfg.maxContextTokens > MAX_SANE_CONTEXT_TOKENS)) {
      issues.push(`maxContextTokens must be between 1 and ${MAX_SANE_CONTEXT_TOKENS}`);
    }

    // --- Referenced models must exist ----------------------------------
    const allIds = [...(cfg.allowedModels ?? []), ...(cfg.fallbackModels ?? []), ...(cfg.preferredModel ? [cfg.preferredModel] : [])];
    for (const id of new Set(allIds)) {
      if (!modelRegistry.get(id)) issues.push(`references unknown model id: ${id}`);
    }

    // --- Preferred/fallback must live inside the allowlist, if one exists ---
    if (cfg.allowedModels && cfg.allowedModels.length > 0) {
      const allowedSet = new Set(cfg.allowedModels);
      if (cfg.preferredModel && !allowedSet.has(cfg.preferredModel)) {
        issues.push(`preferredModel "${cfg.preferredModel}" is not in allowedModels`);
      }
      for (const fb of cfg.fallbackModels ?? []) {
        if (!allowedSet.has(fb)) issues.push(`fallback model "${fb}" is not in allowedModels`);
      }
      if (cfg.allowedModels.length === 0) {
        issues.push('allowedModels is present but empty — this would block all requests; omit the field instead');
      }
    }

    // --- Required Capability + No Allowed Model Supporting Capability ---
    if (requiredCapabilitiesHint && requiredCapabilitiesHint.length > 0 && cfg.allowedModels && cfg.allowedModels.length > 0) {
      const capableModels = cfg.allowedModels.filter((id) => {
        const model = modelRegistry.get(id);
        return model && requiredCapabilitiesHint.every((cap) => model.capabilities.includes(cap));
      });
      if (capableModels.length === 0) {
        issues.push(
          `no model in allowedModels supports required capabilities [${requiredCapabilitiesHint.join(', ')}] — this policy would make the task impossible to serve`
        );
      }

      // --- Fallback Model + Unsupported Capability ---
      for (const fb of cfg.fallbackModels ?? []) {
        const model = modelRegistry.get(fb);
        if (model && !requiredCapabilitiesHint.every((cap) => model.capabilities.includes(cap))) {
          issues.push(`fallback model "${fb}" does not support required capabilities [${requiredCapabilitiesHint.join(', ')}]`);
        }
      }
    }

    if (issues.length > 0) throw new PolicyValidationError(issues);
  }
}
