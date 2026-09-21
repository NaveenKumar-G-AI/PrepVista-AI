import type { LLMProvider } from "./provider.interface";

export type RoutingTask = "simple_explanation" | "complex_reasoning" | "large_context";

/**
 * Routes a coaching task to whichever configured provider fits it best,
 * falling back to whatever's available rather than hard-coding one
 * provider for the whole product.
 */
export class ProviderRouter {
  constructor(private providers: LLMProvider[]) {
    if (providers.length === 0) throw new Error("ProviderRouter requires at least one provider");
  }

  pick(task: RoutingTask): LLMProvider {
    if (task === "large_context") {
      const fit = this.providers.find((p) => p.supportsLargeContext);
      if (fit) return fit;
    }
    if (task === "simple_explanation") {
      const fit = this.providers.find((p) => p.speedTier === "fast");
      if (fit) return fit;
    }
    if (task === "complex_reasoning") {
      const fit = this.providers.find((p) => p.speedTier === "strong") ?? this.providers.find((p) => p.speedTier === "standard");
      if (fit) return fit;
    }
    return this.providers[0];
  }

  /** Ordered fallback chain starting from `primary`, for retry-on-provider-failure. */
  fallbackOrder(primary: LLMProvider): LLMProvider[] {
    return [primary, ...this.providers.filter((p) => p !== primary)];
  }
}
