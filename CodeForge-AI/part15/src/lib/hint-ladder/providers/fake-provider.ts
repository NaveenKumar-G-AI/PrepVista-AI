/**
 * FakeProvider — TEST-ONLY. Never wired into the real router in
 * production (see router.ts, which only ever constructs GroqProvider /
 * GeminiProvider). Lets the policy engine, service orchestration, and
 * golden end-to-end scenario be tested deterministically without a
 * network call or a real API key, per "mocks are allowed only inside
 * automated tests."
 */

import { AIProvider, ProviderCallParams, ProviderCallResult, ProviderError } from "./types";

export type FakeResponder = (params: ProviderCallParams) => string;

export class FakeProvider implements AIProvider {
  readonly name = "groq" as const; // masquerades as whichever provider the test wants to exercise
  private callCount = 0;
  public readonly calls: ProviderCallParams[] = [];

  constructor(
    private readonly responder: FakeResponder,
    private readonly options: { shouldFail?: boolean; failTimes?: number } = {}
  ) {}

  isConfigured(): boolean {
    return true;
  }

  async generate(params: ProviderCallParams): Promise<ProviderCallResult> {
    this.calls.push(params);
    this.callCount++;
    if (this.options.shouldFail && (this.options.failTimes === undefined || this.callCount <= this.options.failTimes)) {
      throw new ProviderError("Simulated provider failure.", "groq");
    }
    return {
      rawText: this.responder(params),
      provider: "groq",
      model: "fake-model",
      latencyMs: 1,
    };
  }
}

/** Convenience: a responder that always returns a fixed, schema-valid JSON string. */
export function fixedJsonResponder(json: Record<string, unknown>): FakeResponder {
  return () => JSON.stringify(json);
}
