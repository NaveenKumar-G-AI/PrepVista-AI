/**
 * Provider abstraction. Add a new provider by implementing this interface —
 * nothing else in the AI layer is provider-specific. This mirrors how an
 * existing CodeForge "AI provider abstraction" (Groq/Gemini today) would be
 * reused rather than duplicated, per the spec's explicit instruction.
 */
export interface AIProviderRequest {
  systemPrompt: string;
  userPrompt: string;
  jsonSchema: Record<string, unknown>;
  schemaName: string;
  timeoutMs: number;
}

export interface AIProviderResponse {
  rawText: string;
  provider: string;
  model: string;
  latencyMs: number;
  promptTokens?: number;
  completionTokens?: number;
}

export class AIProviderError extends Error {
  constructor(
    message: string,
    public readonly kind: "timeout" | "http" | "network" | "rate_limited",
    public readonly provider: string
  ) {
    super(message);
    this.name = "AIProviderError";
  }
}

export interface AIProvider {
  readonly name: string;
  readonly model: string;
  complete(req: AIProviderRequest): Promise<AIProviderResponse>;
}
