import type { AIGenerateOptions, AIProvider } from './AIProvider.js';
import { AIProviderError } from './AIProvider.js';

/**
 * Gemini's generateContent REST endpoint.
 * POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent
 * Requires GEMINI_API_KEY, sent as the x-goog-api-key header (current
 * Google guidance, verified Aug 2026 — avoids the key appearing in URLs/logs
 * the way the older `?key=` query param does).
 *
 * Model names move fast — `gemini-2.5-flash` is a safe default as of this
 * writing, but check https://ai.google.dev/gemini-api/docs/models for the
 * current lineup before deploying.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';

  constructor(
    private apiKey: string,
    private model = 'gemini-2.5-flash'
  ) {}

  async generateText(prompt: string, options?: AIGenerateOptions): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': this.apiKey,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: options?.maxTokens ?? 300,
          temperature: options?.temperature ?? 0.3,
        },
      }),
    });

    if (!res.ok) {
      throw new AIProviderError(this.name, `HTTP ${res.status}: ${await res.text()}`);
    }
    const data = (await res.json()) as any;
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new AIProviderError(this.name, 'Unexpected response shape');
    }
    return text;
  }
}
