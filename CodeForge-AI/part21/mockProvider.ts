/**
 * Deterministic in-memory provider used by tests (and safe for local dev
 * without API keys). Responses are supplied by the test as a queue or a
 * matcher function, so scenario tests can script an entire multi-probe
 * conversation without any network access.
 */
import type { AIProvider, ProviderResult, StructuredCallParams } from "./provider.js";

export type MockResponder = (params: StructuredCallParams, callIndex: number) => unknown;

export class MockAIProvider implements AIProvider {
  readonly name = "mock";
  private queue: unknown[] = [];
  private responder: MockResponder | null = null;
  private callCount = 0;
  public calls: StructuredCallParams[] = [];
  private failNextN = 0;
  private malformedNextN = 0;

  isConfigured(): boolean {
    return true;
  }

  /** Enqueue one JSON-serializable object to be returned on the next call. */
  enqueue(response: unknown): this {
    this.queue.push(response);
    return this;
  }

  /** Provide a function that computes a response from the request instead of a fixed queue. */
  setResponder(fn: MockResponder): this {
    this.responder = fn;
    return this;
  }

  /** Simulate provider failure (network/timeout) for the next N calls. */
  failNext(n = 1): this {
    this.failNextN += n;
    return this;
  }

  /** Simulate a schema-invalid response for the next N calls (to exercise retry/repair). */
  respondMalformedNext(n = 1): this {
    this.malformedNextN += n;
    return this;
  }

  async generate(params: StructuredCallParams): Promise<ProviderResult> {
    this.calls.push(params);
    const index = this.callCount++;

    if (this.failNextN > 0) {
      this.failNextN--;
      throw new Error("Simulated provider failure");
    }

    if (this.malformedNextN > 0) {
      this.malformedNextN--;
      return { rawText: "{not valid json", provider: this.name, latencyMs: 1 };
    }

    const payload = this.responder ? this.responder(params, index) : this.queue.shift();
    if (payload === undefined) {
      throw new Error("MockAIProvider: no response queued for call " + index);
    }
    return { rawText: JSON.stringify(payload), provider: this.name, latencyMs: 1 };
  }
}
