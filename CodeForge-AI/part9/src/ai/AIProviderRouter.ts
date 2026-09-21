import type { AIGenerateOptions, AIProvider } from './AIProvider.js';

export type DeterministicFallback = (prompt: string) => string;

/**
 * PHASE 39 / 73: try providers in order; if every provider fails, fall back
 * to a deterministic string builder supplied by the caller instead of
 * throwing. Nothing downstream of this router may hard-depend on AI being
 * up — see RecommendationService, which always has a deterministic reason
 * string ready before it ever calls this.
 */
export class AIProviderRouter {
  constructor(
    private providers: AIProvider[],
    private fallback: DeterministicFallback
  ) {}

  async generateText(prompt: string, options?: AIGenerateOptions): Promise<{ text: string; usedProvider: string }> {
    for (const provider of this.providers) {
      try {
        const text = await provider.generateText(prompt, options);
        return { text, usedProvider: provider.name };
      } catch {
        continue;
      }
    }
    return { text: this.fallback(prompt), usedProvider: 'deterministic-fallback' };
  }
}
