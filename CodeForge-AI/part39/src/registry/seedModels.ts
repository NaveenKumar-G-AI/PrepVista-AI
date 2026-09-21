import { ModelCapability, ModelDescriptor, ModelStatus } from '../types';

/**
 * Seed data for the model registry.
 *
 * Pricing below was verified against public provider pricing pages and
 * cross-referenced across multiple independent sources on 2026-08-22 (see
 * `pricingSource` / `pricingAsOf` per entry). It is NOT invented, but it
 * WILL drift — providers change prices without notice. This is exactly
 * why pricing lives here as versioned data (see CostCalculator +
 * `pricingVersion`) instead of being hardcoded into business logic:
 * update this file (or better, the DB-backed registry in production) and
 * every cost calculation picks it up automatically, while historical
 * records keep referencing the pricing version that was actually in
 * effect when they were recorded.
 *
 * The `mock` provider is intentionally priced at $0 — it is not a real
 * model and must never be selected by a production policy (see
 * PolicyValidator, which rejects any policy that allows it outside a
 * non-production environment).
 */
const PRICING_AS_OF = '2026-08-22';
const ANTHROPIC_SOURCE = 'https://platform.claude.com/docs/en/about-claude/pricing (verified 2026-08-22)';
const OPENAI_SOURCE = 'https://platform.openai.com/docs/pricing (verified 2026-08-22)';

export const seedModels: ModelDescriptor[] = [
  {
    id: 'mock:test-model',
    provider: 'mock',
    modelKey: 'test-model',
    family: 'mock',
    capabilities: [ModelCapability.GENERAL, ModelCapability.FAST, ModelCapability.STRUCTURED_OUTPUT, ModelCapability.STREAMING],
    contextWindow: 32_000,
    maxOutputTokens: 4_096,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 0, outputPricePerMTok: 0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: 'N/A — mock provider, no real billing' },
  },
  {
    id: 'anthropic:claude-haiku-4-5-20251001',
    provider: 'anthropic',
    modelKey: 'claude-haiku-4-5-20251001',
    family: 'claude-haiku',
    capabilities: [ModelCapability.GENERAL, ModelCapability.FAST, ModelCapability.STRUCTURED_OUTPUT, ModelCapability.STREAMING],
    contextWindow: 200_000,
    maxOutputTokens: 8_192,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 1.0, outputPricePerMTok: 5.0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: ANTHROPIC_SOURCE },
  },
  {
    id: 'anthropic:claude-sonnet-5',
    provider: 'anthropic',
    modelKey: 'claude-sonnet-5',
    family: 'claude-sonnet',
    capabilities: [
      ModelCapability.GENERAL,
      ModelCapability.REASONING,
      ModelCapability.CODING,
      ModelCapability.LONG_CONTEXT,
      ModelCapability.STRUCTURED_OUTPUT,
      ModelCapability.STREAMING,
    ],
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 2.0, outputPricePerMTok: 10.0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: ANTHROPIC_SOURCE },
  },
  {
    id: 'anthropic:claude-opus-4-8',
    provider: 'anthropic',
    modelKey: 'claude-opus-4-8',
    family: 'claude-opus',
    capabilities: [
      ModelCapability.GENERAL,
      ModelCapability.REASONING,
      ModelCapability.CODING,
      ModelCapability.LONG_CONTEXT,
      ModelCapability.STRUCTURED_OUTPUT,
      ModelCapability.STREAMING,
    ],
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 5.0, outputPricePerMTok: 25.0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: ANTHROPIC_SOURCE },
  },
  {
    id: 'anthropic:claude-fable-5',
    provider: 'anthropic',
    modelKey: 'claude-fable-5',
    family: 'claude-fable',
    capabilities: [ModelCapability.GENERAL, ModelCapability.REASONING, ModelCapability.LONG_CONTEXT, ModelCapability.STRUCTURED_OUTPUT, ModelCapability.STREAMING],
    contextWindow: 1_000_000,
    maxOutputTokens: 64_000,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 10.0, outputPricePerMTok: 50.0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: ANTHROPIC_SOURCE },
  },
  {
    id: 'openai:gpt-5.6-luna',
    provider: 'openai',
    modelKey: 'gpt-5.6-luna',
    family: 'gpt-5.6',
    capabilities: [ModelCapability.GENERAL, ModelCapability.FAST, ModelCapability.STRUCTURED_OUTPUT, ModelCapability.STREAMING],
    contextWindow: 1_050_000,
    maxOutputTokens: 32_000,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 0.2, outputPricePerMTok: 1.2, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: OPENAI_SOURCE },
  },
  {
    id: 'openai:gpt-5.6-terra',
    provider: 'openai',
    modelKey: 'gpt-5.6-terra',
    family: 'gpt-5.6',
    capabilities: [ModelCapability.GENERAL, ModelCapability.CODING, ModelCapability.LONG_CONTEXT, ModelCapability.STRUCTURED_OUTPUT, ModelCapability.STREAMING],
    contextWindow: 1_050_000,
    maxOutputTokens: 32_000,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 2.0, outputPricePerMTok: 12.0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: OPENAI_SOURCE },
  },
  {
    id: 'openai:gpt-5.6-sol',
    provider: 'openai',
    modelKey: 'gpt-5.6-sol',
    family: 'gpt-5.6',
    capabilities: [
      ModelCapability.GENERAL,
      ModelCapability.REASONING,
      ModelCapability.CODING,
      ModelCapability.LONG_CONTEXT,
      ModelCapability.STRUCTURED_OUTPUT,
      ModelCapability.STREAMING,
    ],
    contextWindow: 1_050_000,
    maxOutputTokens: 32_000,
    status: ModelStatus.ACTIVE,
    pricing: { inputPricePerMTok: 5.0, outputPricePerMTok: 30.0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: OPENAI_SOURCE },
  },
  {
    id: 'openai:text-embedding-3-large',
    provider: 'openai',
    modelKey: 'text-embedding-3-large',
    family: 'text-embedding-3',
    capabilities: [ModelCapability.EMBEDDING],
    contextWindow: 8_191,
    maxOutputTokens: 0,
    status: ModelStatus.ACTIVE,
    // Embedding pricing changes independently of chat models and was not
    // re-verified in the same pass — confirm before relying on it.
    pricing: { inputPricePerMTok: 0.13, outputPricePerMTok: 0, pricingVersion: 1, pricingAsOf: PRICING_AS_OF, pricingSource: OPENAI_SOURCE + ' (unverified this pass — re-check)' },
  },
];
