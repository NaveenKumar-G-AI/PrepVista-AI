export interface AIGenerateOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface AIProvider {
  readonly name: string;
  generateText(prompt: string, options?: AIGenerateOptions): Promise<string>;
}

export class AIProviderError extends Error {
  constructor(
    public providerName: string,
    message: string,
    public cause?: unknown
  ) {
    super(`[${providerName}] ${message}`);
  }
}
