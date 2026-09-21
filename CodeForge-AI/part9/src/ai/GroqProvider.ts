import type { AIGenerateOptions, AIProvider } from './AIProvider.js';
import { AIProviderError } from './AIProvider.js';

/**
 * Groq's OpenAI-compatible chat completions endpoint.
 * POST https://api.groq.com/openai/v1/chat/completions
 * Requires GROQ_API_KEY. Verified against console.groq.com/docs (Aug 2026).
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';

  constructor(
    private apiKey: string,
    private model = 'llama-3.3-70b-versatile'
  ) {}

  async generateText(prompt: string, options?: AIGenerateOptions): Promise<string> {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: options?.maxTokens ?? 300,
        temperature: options?.temperature ?? 0.3,
      }),
    });

    if (!res.ok) {
      throw new AIProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new AIProviderError(this.name, 'Unexpected response shape');
    }
    return text;
  }
}
