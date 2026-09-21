import { config } from '../config';
import { normalizeError } from '../errors';
import { ModelCapability, ProviderHealth, ProviderHealthStatus, ProviderMetadata } from '../types';
import { EmbedParams, EmbedResult, GenerateParams, GenerateResult, ProviderAdapter, StreamChunk } from './ProviderAdapter';

const API_BASE = 'https://api.openai.com/v1';

/**
 * Real OpenAI Chat Completions adapter. Requires OPENAI_API_KEY (see
 * .env.example, left blank). Same fail-fast-when-unconfigured behavior as
 * AnthropicProvider — see that file's header comment.
 *
 * Note: OpenAI's network domain is NOT in this sandbox's egress allowlist,
 * so this adapter has been written to the documented Chat Completions
 * contract but has not been exercised against a live endpoint from this
 * environment. Re-verify against https://platform.openai.com/docs before
 * trusting it in production.
 */
export class OpenAIProvider implements ProviderAdapter {
  readonly name = 'openai';

  private get apiKey(): string {
    return config.providers.openaiApiKey;
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw normalizeError(new Error('Authentication failed: OPENAI_API_KEY is not configured'), this.name);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    if (params.signal) params.signal.addEventListener('abort', () => controller.abort());

    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: params.modelKey,
          messages: params.messages,
          max_tokens: params.maxOutputTokens,
          temperature: params.temperature,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        choices: Array<{ message: { content: string }; finish_reason: string }>;
        usage: { prompt_tokens: number; completion_tokens: number; total_tokens: number };
      };

      return {
        text: data.choices[0]?.message?.content ?? '',
        usage: {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        },
        finishReason: data.choices[0]?.finish_reason ?? 'stop',
        usageIsExact: true,
      };
    } catch (err) {
      throw normalizeError(err, this.name);
    } finally {
      clearTimeout(timer);
    }
  }

  async *stream(params: GenerateParams): AsyncIterable<StreamChunk> {
    if (!this.apiKey) {
      throw normalizeError(new Error('Authentication failed: OPENAI_API_KEY is not configured'), this.name);
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    if (params.signal) params.signal.addEventListener('abort', () => controller.abort());

    try {
      const res = await fetch(`${API_BASE}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({
          model: params.modelKey,
          messages: params.messages,
          max_tokens: params.maxOutputTokens,
          temperature: params.temperature,
          stream: true,
          stream_options: { include_usage: true },
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let usage: { inputTokens: number; outputTokens: number; totalTokens: number } | undefined;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === '[DONE]') continue;
          const event = JSON.parse(payload);
          const delta: string | undefined = event.choices?.[0]?.delta?.content;
          if (delta) yield { delta, done: false };
          if (event.usage) {
            usage = {
              inputTokens: event.usage.prompt_tokens,
              outputTokens: event.usage.completion_tokens,
              totalTokens: event.usage.total_tokens,
            };
          }
        }
      }

      yield { delta: '', done: true, usage };
    } catch (err) {
      throw normalizeError(err, this.name);
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(params: EmbedParams): Promise<EmbedResult> {
    if (!this.apiKey) {
      throw normalizeError(new Error('Authentication failed: OPENAI_API_KEY is not configured'), this.name);
    }
    try {
      const res = await fetch(`${API_BASE}/embeddings`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${this.apiKey}` },
        body: JSON.stringify({ model: params.modelKey, input: params.input }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`OpenAI API ${res.status}: ${body.slice(0, 300)}`);
      }
      const data = (await res.json()) as { data: Array<{ embedding: number[] }>; usage: { prompt_tokens: number } };
      return { vector: data.data[0]?.embedding ?? [], usage: { inputTokens: data.usage.prompt_tokens } };
    } catch (err) {
      throw normalizeError(err, this.name);
    }
  }

  async health(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        status: ProviderHealthStatus.UNAVAILABLE,
        checkedAt: new Date().toISOString(),
        detail: 'OPENAI_API_KEY not configured',
      };
    }
    try {
      const res = await fetch(`${API_BASE}/models`, { headers: { authorization: `Bearer ${this.apiKey}` } });
      if (res.ok) return { provider: this.name, status: ProviderHealthStatus.HEALTHY, checkedAt: new Date().toISOString() };
      if (res.status === 401) return { provider: this.name, status: ProviderHealthStatus.UNAVAILABLE, checkedAt: new Date().toISOString(), detail: 'Invalid API key' };
      if (res.status === 429) return { provider: this.name, status: ProviderHealthStatus.RATE_LIMITED, checkedAt: new Date().toISOString() };
      return { provider: this.name, status: ProviderHealthStatus.DEGRADED, checkedAt: new Date().toISOString(), detail: `HTTP ${res.status}` };
    } catch (err) {
      return { provider: this.name, status: ProviderHealthStatus.UNAVAILABLE, checkedAt: new Date().toISOString(), detail: (err as Error).message };
    }
  }

  metadata(): ProviderMetadata {
    return {
      name: this.name,
      capabilities: [
        ModelCapability.GENERAL,
        ModelCapability.REASONING,
        ModelCapability.CODING,
        ModelCapability.LONG_CONTEXT,
        ModelCapability.STRUCTURED_OUTPUT,
        ModelCapability.STREAMING,
        ModelCapability.FAST,
        ModelCapability.EMBEDDING,
      ],
      supportsStreaming: true,
      requiresApiKey: true,
      hasApiKeyConfigured: Boolean(this.apiKey),
    };
  }
}
