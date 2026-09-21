import { ProviderHealth, ProviderMetadata, TokenUsage } from '../types';

export interface GenerateParams {
  modelKey: string;
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>;
  maxOutputTokens?: number;
  temperature?: number;
  timeoutMs: number;
  signal?: AbortSignal;
}

export interface GenerateResult {
  text: string;
  usage: TokenUsage;
  finishReason: string;
  /** True usage numbers as reported by the provider, vs. estimated client-side. */
  usageIsExact: boolean;
}

export interface StreamChunk {
  delta: string;
  done: boolean;
  usage?: TokenUsage;
}

export interface EmbedParams {
  modelKey: string;
  input: string;
  timeoutMs: number;
}

export interface EmbedResult {
  vector: number[];
  usage: Pick<TokenUsage, 'inputTokens'>;
}

/**
 * Every AI provider (Anthropic, OpenAI, an internal fine-tune host, a mock
 * for local dev) implements this interface. Application code and the
 * gateway itself only ever talk to ProviderAdapter — never to a provider
 * SDK directly.
 */
export interface ProviderAdapter {
  readonly name: string;

  generate(params: GenerateParams): Promise<GenerateResult>;

  stream(params: GenerateParams): AsyncIterable<StreamChunk>;

  embed(params: EmbedParams): Promise<EmbedResult>;

  health(): Promise<ProviderHealth>;

  metadata(): ProviderMetadata;
}
