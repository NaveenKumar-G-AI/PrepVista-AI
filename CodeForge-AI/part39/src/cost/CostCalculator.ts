import { CostBasis, ModelDescriptor, TokenUsage } from '../types';

export interface CostResult {
  usd: number;
  basis: CostBasis;
  pricingVersion: number;
}

/**
 * The ONLY place a cost figure is computed from tokens + pricing. Every
 * other module that needs a cost (BudgetEngine reservations, telemetry,
 * dashboard analytics) calls through here rather than repeating the
 * arithmetic — see the spec's "Do not scatter calculations across
 * individual features."
 *
 * NOTE ON SCOPE: this implements flat per-token pricing. It intentionally
 * does not model provider-specific modifiers such as prompt-caching
 * discounts, batch-API discounts, or long-context pricing tiers above a
 * token threshold — several current providers price >200K/272K-token
 * requests differently. Extending PRICING here (rather than in
 * BudgetEngine or the dashboard) is exactly the point of centralizing
 * this: add those modifiers once, and every caller picks them up.
 */
export class CostCalculator {
  /** Cost from a provider's own reported usage — the authoritative figure when available. */
  actual(model: ModelDescriptor, usage: TokenUsage, usageIsExact: boolean): CostResult {
    if (!usageIsExact) return this.estimated(model, usage);
    return {
      usd: this.compute(model, usage),
      basis: CostBasis.ACTUAL,
      pricingVersion: model.pricing.pricingVersion,
    };
  }

  /** Cost projected from an approximate token count, before or in place of a real usage report. */
  estimated(model: ModelDescriptor, usage: TokenUsage): CostResult {
    return {
      usd: this.compute(model, usage),
      basis: CostBasis.ESTIMATED,
      pricingVersion: model.pricing.pricingVersion,
    };
  }

  unavailable(model: ModelDescriptor): CostResult {
    return { usd: 0, basis: CostBasis.UNAVAILABLE, pricingVersion: model.pricing.pricingVersion };
  }

  /** Pre-flight estimate before a call is made, from a prompt token count and an assumed output ceiling. */
  preflightEstimate(model: ModelDescriptor, inputTokens: number, maxOutputTokens: number): number {
    return this.compute(model, { inputTokens, outputTokens: maxOutputTokens, totalTokens: inputTokens + maxOutputTokens });
  }

  private compute(model: ModelDescriptor, usage: TokenUsage): number {
    const inputCost = (usage.inputTokens / 1_000_000) * model.pricing.inputPricePerMTok;
    const outputCost = (usage.outputTokens / 1_000_000) * model.pricing.outputPricePerMTok;
    return Math.round((inputCost + outputCost) * 1_000_000) / 1_000_000; // round to 6dp (µ-dollar precision)
  }

  costPerSuccessfulTask(totalCostUsd: number, successfulTaskCount: number): number | null {
    if (successfulTaskCount <= 0) return null;
    return totalCostUsd / successfulTaskCount;
  }
}

export const costCalculator = new CostCalculator();
