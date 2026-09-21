export type ProviderName = "groq" | "gemini";
export type ModelTier = "fast" | "strong";

export interface ProviderCallParams {
  systemPrompt: string;
  userPrompt: string;
  tier: ModelTier;
  /** Abort the call if it runs longer than this — hint generation must never block the editor/submission flow. */
  timeoutMs: number;
}

export interface ProviderCallResult {
  rawText: string;
  provider: ProviderName;
  model: string;
  latencyMs: number;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ProviderName,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

export class ProviderNotConfiguredError extends ProviderError {
  constructor(provider: ProviderName) {
    super(`${provider} is not configured (missing API key or model).`, provider);
    this.name = "ProviderNotConfiguredError";
  }
}

export interface AIProvider {
  readonly name: ProviderName;
  isConfigured(): boolean;
  generate(params: ProviderCallParams): Promise<ProviderCallResult>;
}
