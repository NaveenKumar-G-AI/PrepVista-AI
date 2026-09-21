import { ModelCapability, ProviderHealth, ProviderHealthStatus, ProviderMetadata } from '../types';
import { EmbedParams, EmbedResult, GenerateParams, GenerateResult, ProviderAdapter, StreamChunk } from './ProviderAdapter';

/**
 * Deterministic, dependency-free provider. Ships enabled by default so the
 * gateway, dashboard, and test suite are runnable with zero configuration
 * and zero API keys — this is NOT wired to any real model and must never
 * be selected in a production policy. Its `metadata()` and model registry
 * entry both mark it clearly so it can't be mistaken for a real provider
 * in the dashboard or audit log.
 */
export class MockProvider implements ProviderAdapter {
  readonly name = 'mock';

  private static approxTokens(text: string): number {
    // Rough, provider-agnostic estimate (~4 chars/token in English prose).
    // Real adapters should prefer the provider's own reported usage.
    return Math.max(1, Math.ceil(text.length / 4));
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    const latency = 120 + Math.random() * 180;
    await new Promise((resolve) => setTimeout(resolve, Math.min(latency, params.timeoutMs)));

    const lastUser = [...params.messages].reverse().find((m) => m.role === 'user');
    const inputText = params.messages.map((m) => m.content).join('\n');
    const inputTokens = MockProvider.approxTokens(inputText);

    const text = `[mock:${params.modelKey}] Simulated response to: "${(lastUser?.content ?? '').slice(0, 120)}"`;
    const outputTokens = Math.min(params.maxOutputTokens ?? 256, MockProvider.approxTokens(text));

    return {
      text,
      usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens },
      finishReason: 'stop',
      usageIsExact: false,
    };
  }

  async *stream(params: GenerateParams): AsyncIterable<StreamChunk> {
    const result = await this.generate(params);
    const words = result.text.split(' ');
    for (let i = 0; i < words.length; i++) {
      await new Promise((resolve) => setTimeout(resolve, 15));
      yield { delta: (i === 0 ? '' : ' ') + words[i], done: false };
    }
    yield { delta: '', done: true, usage: result.usage };
  }

  async embed(params: EmbedParams): Promise<EmbedResult> {
    const dim = 16;
    // Deterministic pseudo-embedding derived from a simple string hash, so
    // identical input always yields an identical vector (useful for cache
    // tests) without pulling in a real embedding model.
    let seed = 0;
    for (let i = 0; i < params.input.length; i++) seed = (seed * 31 + params.input.charCodeAt(i)) >>> 0;
    const vector = Array.from({ length: dim }, (_, i) => {
      seed = (seed * 1103515245 + 12345 + i) >>> 0;
      return (seed % 2000) / 1000 - 1;
    });
    return { vector, usage: { inputTokens: MockProvider.approxTokens(params.input) } };
  }

  async health(): Promise<ProviderHealth> {
    return { provider: this.name, status: ProviderHealthStatus.HEALTHY, checkedAt: new Date().toISOString() };
  }

  metadata(): ProviderMetadata {
    return {
      name: this.name,
      capabilities: [ModelCapability.GENERAL, ModelCapability.FAST, ModelCapability.STRUCTURED_OUTPUT, ModelCapability.STREAMING],
      supportsStreaming: true,
      requiresApiKey: false,
      hasApiKeyConfigured: true,
    };
  }
}
