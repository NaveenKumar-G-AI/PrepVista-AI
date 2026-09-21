import { ZodSchema } from 'zod';

export interface AICompletionRequest {
  systemPrompt: string;
  userPrompt: string;
}

export interface RawAIResult {
  provider: string;
  raw: string;
}

export interface AIProvider {
  readonly name: string;
  complete(request: AICompletionRequest): Promise<RawAIResult>;
}

export class AIProviderError extends Error {
  constructor(public readonly provider: string, message: string, public readonly cause?: unknown) {
    super(`[${provider}] ${message}`);
    this.name = 'AIProviderError';
  }
}

export type AIResultSource = 'AI' | 'DETERMINISTIC_FALLBACK';

export interface OrchestratedResult<T> {
  data: T;
  source: AIResultSource;
  provider?: string;
  attempts: number;
}

export interface AIOrchestratorOptions {
  /** Ordered by preference — PHASE 20: "GroqProvider, GeminiProvider,
   *  FutureProvider". The first provider is tried first; later ones are
   *  fallbacks, not load-balanced alternatives. */
  providers: AIProvider[];
  maxAttemptsPerProvider?: number;
}

/**
 * Tries each provider in order, retrying malformed/failed responses a few
 * times before moving on. If every provider is exhausted, calls the
 * caller-supplied deterministic fallback instead of ever fabricating a
 * successful AI response (PHASE 20 AI FAILURE: "Never fabricate a
 * successful AI response").
 */
export class AIOrchestrator {
  private providers: AIProvider[];
  private maxAttemptsPerProvider: number;

  constructor(options: AIOrchestratorOptions) {
    if (options.providers.length === 0) {
      throw new Error('AIOrchestrator requires at least one provider');
    }
    this.providers = options.providers;
    this.maxAttemptsPerProvider = options.maxAttemptsPerProvider ?? 2;
  }

  async completeWithFallback<T>(
    request: AICompletionRequest,
    schema: ZodSchema<T>,
    deterministicFallback: () => T,
  ): Promise<OrchestratedResult<T>> {
    let attempts = 0;
    for (const provider of this.providers) {
      for (let i = 0; i < this.maxAttemptsPerProvider; i++) {
        attempts++;
        try {
          const raw = await provider.complete(request);
          const parsed = this.parseJson(raw.raw);
          const result = schema.safeParse(parsed);
          if (result.success) {
            return { data: result.data, source: 'AI', provider: provider.name, attempts };
          }
          // Malformed shape — retry this provider before giving up on it.
        } catch {
          // Network/provider failure — retry this provider before giving up on it.
        }
      }
    }
    return { data: deterministicFallback(), source: 'DETERMINISTIC_FALLBACK', attempts };
  }

  private parseJson(raw: string): unknown {
    const trimmed = raw.trim().replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '');
    return JSON.parse(trimmed);
  }
}
