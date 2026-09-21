import type { AIProvider, AIProviderRequest, AIProviderResponse } from "../../src/ai/provider.js";
import { AIProviderError } from "../../src/ai/provider.js";

type Behavior =
  | { kind: "respond"; body: unknown; latencyMs?: number }
  | { kind: "respond-raw"; text: string }
  | { kind: "throw"; error: AIProviderError }
  | { kind: "sequence"; behaviors: Behavior[] };

/**
 * A fully in-memory AIProvider double. Tests use this instead of hitting
 * real Groq/Gemini endpoints (which this sandbox cannot reach anyway — no
 * network egress to those domains, no API keys). This is the standard,
 * expected place to use mocks per the spec's own "Mocks are allowed only
 * in tests" rule; no production code path uses this class.
 */
export class FakeProvider implements AIProvider {
  readonly name = "fake";
  readonly model = "fake-model";
  private sequence: Behavior[];
  private index = 0;
  public calls: AIProviderRequest[] = [];

  constructor(behavior: Behavior) {
    this.sequence = behavior.kind === "sequence" ? behavior.behaviors : [behavior];
  }

  async complete(req: AIProviderRequest): Promise<AIProviderResponse> {
    this.calls.push(req);
    const behavior = this.sequence[Math.min(this.index, this.sequence.length - 1)]!;
    this.index += 1;

    if (behavior.kind === "throw") throw behavior.error;
    const rawText = behavior.kind === "respond-raw" ? behavior.text : JSON.stringify(behavior.body);
    return {
      rawText,
      provider: this.name,
      model: this.model,
      latencyMs: behavior.kind === "respond" ? (behavior.latencyMs ?? 42) : 42,
    };
  }
}

export function timeoutError() {
  return new AIProviderError("timed out", "timeout", "fake");
}
export function httpError() {
  return new AIProviderError("HTTP 500", "http", "fake");
}
export function rateLimitError() {
  return new AIProviderError("rate limited", "rate_limited", "fake");
}
