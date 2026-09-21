import { config } from '../config';
import { normalizeError } from '../errors';
import { ModelCapability, ProviderHealth, ProviderHealthStatus, ProviderMetadata } from '../types';
import { EmbedParams, EmbedResult, GenerateParams, GenerateResult, ProviderAdapter, StreamChunk } from './ProviderAdapter';

const API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

/**
 * Real Anthropic Messages API adapter. Requires ANTHROPIC_API_KEY to be
 * set (see .env.example) — this repo intentionally ships with it blank.
 * With no key configured, health() reports UNAVAILABLE and generate()
 * fails fast with a normalized AUTHENTICATION error instead of attempting
 * a call that can only fail. The gateway's routing/fallback logic treats
 * that exactly like any other unhealthy provider.
 *
 * Request/response shapes follow the Anthropic Messages API
 * (https://docs.claude.com/en/api/messages). Re-verify against current
 * docs before relying on this in production — API surfaces evolve.
 */
export class AnthropicProvider implements ProviderAdapter {
  readonly name = 'anthropic';

  private get apiKey(): string {
    return config.providers.anthropicApiKey;
  }

  private splitSystem(messages: GenerateParams['messages']): { system?: string; rest: Array<{ role: 'user' | 'assistant'; content: string }> } {
    const systemParts = messages.filter((m) => m.role === 'system').map((m) => m.content);
    const rest = messages.filter((m) => m.role !== 'system') as Array<{ role: 'user' | 'assistant'; content: string }>;
    return { system: systemParts.length ? systemParts.join('\n\n') : undefined, rest };
  }

  async generate(params: GenerateParams): Promise<GenerateResult> {
    if (!this.apiKey) {
      throw normalizeError(new Error('Authentication failed: ANTHROPIC_API_KEY is not configured'), this.name);
    }

    const { system, rest } = this.splitSystem(params.messages);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    if (params.signal) params.signal.addEventListener('abort', () => controller.abort());

    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: params.modelKey,
          max_tokens: params.maxOutputTokens ?? 1024,
          temperature: params.temperature,
          system,
          messages: rest,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }

      const data = (await res.json()) as {
        content: Array<{ type: string; text?: string }>;
        usage: { input_tokens: number; output_tokens: number };
        stop_reason: string;
      };

      const text = data.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');

      return {
        text,
        usage: {
          inputTokens: data.usage.input_tokens,
          outputTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        },
        finishReason: data.stop_reason,
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
      throw normalizeError(new Error('Authentication failed: ANTHROPIC_API_KEY is not configured'), this.name);
    }

    const { system, rest } = this.splitSystem(params.messages);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), params.timeoutMs);
    if (params.signal) params.signal.addEventListener('abort', () => controller.abort());

    try {
      const res = await fetch(`${API_BASE}/messages`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model: params.modelKey,
          max_tokens: params.maxOutputTokens ?? 1024,
          temperature: params.temperature,
          system,
          messages: rest,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!res.ok || !res.body) {
        const body = await res.text().catch(() => '');
        throw new Error(`Anthropic API ${res.status}: ${body.slice(0, 300)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let inputTokens = 0;
      let outputTokens = 0;

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const payload = line.slice(5).trim();
          if (!payload) continue;
          const event = JSON.parse(payload);

          if (event.type === 'content_block_delta' && event.delta?.text) {
            yield { delta: event.delta.text, done: false };
          } else if (event.type === 'message_start') {
            inputTokens = event.message?.usage?.input_tokens ?? 0;
          } else if (event.type === 'message_delta') {
            outputTokens = event.usage?.output_tokens ?? outputTokens;
          }
        }
      }

      yield { delta: '', done: true, usage: { inputTokens, outputTokens, totalTokens: inputTokens + outputTokens } };
    } catch (err) {
      throw normalizeError(err, this.name);
    } finally {
      clearTimeout(timer);
    }
  }

  async embed(_params: EmbedParams): Promise<EmbedResult> {
    // Anthropic does not currently publish a first-party embeddings endpoint.
    // Route embedding tasks to a provider that supports it (see ModelRouter's
    // capability matching) rather than guessing at an API shape here.
    throw normalizeError(new Error('invalid request: embed is not supported by the Anthropic adapter'), this.name);
  }

  async health(): Promise<ProviderHealth> {
    if (!this.apiKey) {
      return {
        provider: this.name,
        status: ProviderHealthStatus.UNAVAILABLE,
        checkedAt: new Date().toISOString(),
        detail: 'ANTHROPIC_API_KEY not configured',
      };
    }
    // A cheap, side-effect-free reachability check. We deliberately avoid
    // spending tokens on a real generate() call just to check health.
    try {
      const res = await fetch(`${API_BASE}/models`, {
        headers: { 'x-api-key': this.apiKey, 'anthropic-version': ANTHROPIC_VERSION },
      });
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
      ],
      supportsStreaming: true,
      requiresApiKey: true,
      hasApiKeyConfigured: Boolean(this.apiKey),
    };
  }
}
