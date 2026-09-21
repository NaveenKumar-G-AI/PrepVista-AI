import { PolicyEngine, PolicyScope } from '../src/policy/PolicyEngine';
import { PolicyValidationError } from '../src/policy/PolicyValidator';
import { ModelCapability } from '../src/types';

// Real seeded model ids from src/registry/seedModels.ts — PolicyValidator
// checks referenced models actually exist in the registry, so tests use
// real ids rather than made-up ones.
const HAIKU = 'anthropic:claude-haiku-4-5-20251001';
const SONNET = 'anthropic:claude-sonnet-5';
const OPUS = 'anthropic:claude-opus-4-8';
const MOCK = 'mock:test-model';
const EMBEDDING_MODEL = 'openai:text-embedding-3-large';

describe('PolicyEngine — hierarchy resolution', () => {
  it('lets a more specific scope override a scalar field from a less specific one', () => {
    const engine = new PolicyEngine();
    engine.setPolicy(PolicyScope.GLOBAL, null, { maxRetries: 1, timeoutMs: 10_000 });
    engine.setPolicy(PolicyScope.ORGANIZATION, 'org1', { maxRetries: 3 });

    const resolved = engine.resolve({ organizationId: 'org1', feature: 'code-review', task: 'CODE_ANALYSIS' });

    expect(resolved.maxRetries).toBe(3); // org wins
    expect(resolved.timeoutMs).toBe(10_000); // inherited from global, untouched by org
    expect(resolved.appliedScopes).toEqual([PolicyScope.GLOBAL, PolicyScope.ORGANIZATION]);
  });

  it('intersects allowedModels across scopes rather than replacing — a child scope can only narrow', () => {
    const engine = new PolicyEngine();
    engine.setPolicy(PolicyScope.GLOBAL, null, { allowedModels: [MOCK, HAIKU, SONNET] });
    engine.setPolicy(PolicyScope.ORGANIZATION, 'org1', { allowedModels: [HAIKU, SONNET, OPUS] });

    const resolved = engine.resolve({ organizationId: 'org1', feature: 'x', task: 'GENERIC' });

    expect(new Set(resolved.allowedModels)).toEqual(new Set([HAIKU, SONNET]));
  });

  it('an org that never restricts allowedModels leaves the field undefined (no restriction), not an empty array', () => {
    const engine = new PolicyEngine();
    const resolved = engine.resolve({ organizationId: 'org-with-no-policy', feature: 'x', task: 'GENERIC' });
    expect(resolved.allowedModels).toBeUndefined();
  });

  it('falls back to safe defaults when nothing is configured for any scope', () => {
    const engine = new PolicyEngine();
    const resolved = engine.resolve({ organizationId: 'brand-new-org', feature: 'x', task: 'GENERIC' });

    expect(resolved.appliedScopes).toEqual([]);
    expect(resolved.timeoutMs).toBeGreaterThan(0);
    expect(resolved.maxRetries).toBeGreaterThanOrEqual(0);
    expect(resolved.cachingEnabled).toBe(true);
    // Never unlimited by default:
    expect(Number.isFinite(resolved.timeoutMs)).toBe(true);
    expect(Number.isFinite(resolved.maxContextTokens)).toBe(true);
  });

  it('a deactivated policy no longer contributes to resolution', () => {
    const engine = new PolicyEngine();
    engine.setPolicy(PolicyScope.ORGANIZATION, 'org1', { maxRetries: 5 });
    engine.deactivate(PolicyScope.ORGANIZATION, 'org1');
    const resolved = engine.resolve({ organizationId: 'org1', feature: 'x', task: 'GENERIC' });
    expect(resolved.appliedScopes).not.toContain(PolicyScope.ORGANIZATION);
  });
});

describe('PolicyEngine / PolicyValidator — rejects impossible configurations', () => {
  it('rejects a policy referencing an unknown model id', () => {
    const engine = new PolicyEngine();
    expect(() => engine.setPolicy(PolicyScope.GLOBAL, null, { allowedModels: ['nonexistent:model'] })).toThrow(PolicyValidationError);
  });

  it('rejects a preferredModel that is not inside allowedModels', () => {
    const engine = new PolicyEngine();
    expect(() =>
      engine.setPolicy(PolicyScope.GLOBAL, null, { allowedModels: [HAIKU], preferredModel: SONNET })
    ).toThrow(PolicyValidationError);
  });

  it('rejects a fallback model that is not inside allowedModels', () => {
    const engine = new PolicyEngine();
    expect(() =>
      engine.setPolicy(PolicyScope.GLOBAL, null, { allowedModels: [HAIKU], fallbackModels: [SONNET] })
    ).toThrow(PolicyValidationError);
  });

  it('rejects "required capability + no allowed model supports it"', () => {
    const engine = new PolicyEngine();
    // HAIKU/SONNET/OPUS are chat models — none support EMBEDDING.
    expect(() =>
      engine.setPolicy(PolicyScope.TASK, 'EMBEDDING', { allowedModels: [HAIKU, SONNET, OPUS] }, undefined, [ModelCapability.EMBEDDING])
    ).toThrow(PolicyValidationError);

    // Adding a model that actually supports EMBEDDING should make it valid.
    expect(() =>
      engine.setPolicy(PolicyScope.TASK, 'EMBEDDING', { allowedModels: [HAIKU, EMBEDDING_MODEL] }, undefined, [ModelCapability.EMBEDDING])
    ).not.toThrow();
  });

  it('rejects a fallback model that lacks a required capability even if other allowed models satisfy it', () => {
    const engine = new PolicyEngine();
    expect(() =>
      engine.setPolicy(
        PolicyScope.TASK,
        'CODE_ANALYSIS',
        { allowedModels: [OPUS, HAIKU], fallbackModels: [HAIKU] },
        undefined,
        [ModelCapability.REASONING] // HAIKU doesn't have REASONING
      )
    ).toThrow(PolicyValidationError);
  });

  it('rejects out-of-range numeric fields', () => {
    const engine = new PolicyEngine();
    expect(() => engine.setPolicy(PolicyScope.GLOBAL, null, { timeoutMs: -1 })).toThrow(PolicyValidationError);
    expect(() => engine.setPolicy(PolicyScope.GLOBAL, null, { maxRetries: 99 })).toThrow(PolicyValidationError);
    expect(() => engine.setPolicy(PolicyScope.GLOBAL, null, { maxConcurrency: 0 })).toThrow(PolicyValidationError);
    expect(() => engine.setPolicy(PolicyScope.GLOBAL, null, { maxCostUsd: -5 })).toThrow(PolicyValidationError);
  });

  it('accepts a well-formed policy', () => {
    const engine = new PolicyEngine();
    expect(() =>
      engine.setPolicy(PolicyScope.FEATURE, 'code-review', {
        preferredModel: SONNET,
        allowedModels: [SONNET, HAIKU, OPUS],
        fallbackModels: [HAIKU],
        timeoutMs: 20_000,
        maxRetries: 2,
        maxConcurrency: 10,
      })
    ).not.toThrow();
  });
});
