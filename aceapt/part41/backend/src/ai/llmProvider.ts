/** Swappable interface so the narrative layer isn't locked to one vendor.
 * See anthropicProvider.ts for the reference implementation. */
export interface LLMProvider {
  readonly isAvailable: boolean;
  complete(systemPrompt: string, userPrompt: string): Promise<string>;
}

/** Used automatically when no API key is configured, so the rest of the
 * pipeline can always call a provider without branching on availability. */
export class NullLLMProvider implements LLMProvider {
  readonly isAvailable = false;
  async complete(): Promise<string> {
    throw new Error('LLM provider not configured (ANTHROPIC_API_KEY is blank) — caller should fall back to the deterministic template.');
  }
}
