/**
 * AI INTEGRATION — Feature 40 <-> Feature 39 boundary
 * -----------------------------------------------------------------------
 * Feature 39 owns AI cost, performance, model routing, policy, budgets,
 * and provider management (Groq/Gemini, per prior CodeForge work).
 * Feature 40 does NOT duplicate any of that — it only needs a narrow
 * read-only capability: "is the AI gateway currently reachable and
 * healthy", for reliability.service.ts's dependency health check and for
 * the AI-provider-down degradation example in reliability/dependencies.ts.
 *
 * This interface is the integration seam. In the real repo, implement it
 * against Feature 39's actual client/health endpoint (AI_GATEWAY_INTERNAL_URL
 * in .env.example is the placeholder for that). The mock below is only
 * used by tests and local dev when no real Feature 39 wiring exists yet.
 */

export interface AIProviderHealth {
  healthy: boolean;
  latencyMs: number;
  detail?: string;
}

export interface AIProviderAdapter {
  checkHealth(): Promise<AIProviderHealth>;
}

/** Deterministic, controllable mock — tests flip `forcedHealthy` to exercise degrade/recover paths without a real network dependency. */
export class MockAIProviderAdapter implements AIProviderAdapter {
  public forcedHealthy = true;
  public forcedLatencyMs = 40;

  async checkHealth(): Promise<AIProviderHealth> {
    await new Promise((r) => setTimeout(r, 1));
    if (!this.forcedHealthy) {
      return { healthy: false, latencyMs: this.forcedLatencyMs, detail: "mock: forced unhealthy for test" };
    }
    return { healthy: true, latencyMs: this.forcedLatencyMs };
  }
}

export const aiProviderAdapter: AIProviderAdapter = new MockAIProviderAdapter();
