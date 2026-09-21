export interface ProviderCallArgs {
  system: string;
  user: string;
  maxTokens?: number;
  temperature?: number;
  timeoutMs?: number;
}

export interface ProviderCallResult {
  rawText: string;
  promptTokens?: number;
  completionTokens?: number;
  latencyMs: number;
}

export interface LLMProvider {
  readonly name: string;
  readonly supportsLargeContext: boolean;
  readonly speedTier: "fast" | "standard" | "strong";
  generate(args: ProviderCallArgs): Promise<ProviderCallResult>;
}

export class ProviderConfigError extends Error {}
export class ProviderRequestError extends Error {}
