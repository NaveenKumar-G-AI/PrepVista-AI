import { AIProvider, AICompletionRequest, RawAIResult, AIProviderError } from '../aiProvider';

export interface GeminiProviderConfig {
  apiKey: string;
  model?: string;
}

/**
 * Gemini's generateContent REST endpoint as of this writing. Same caveat as
 * GroqProvider: not reachable from the build sandbox, written to spec and
 * unit-tested via the AIProvider interface. Confirm GEMINI_MODEL against
 * https://ai.google.dev/gemini-api/docs/models before deploying.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private apiKey: string;
  private model: string;

  constructor(config: GeminiProviderConfig) {
    if (!config.apiKey) throw new Error('GeminiProvider requires an apiKey');
    this.apiKey = config.apiKey;
    this.model = config.model ?? process.env.GEMINI_MODEL ?? 'gemini-2.0-flash';
  }

  async complete(request: AICompletionRequest): Promise<RawAIResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;
    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: request.systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: request.userPrompt }] }],
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      });
    } catch (err) {
      throw new AIProviderError(this.name, 'network error', err);
    }

    if (!response.ok) {
      throw new AIProviderError(this.name, `HTTP ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as {
      candidates?: { content?: { parts?: { text?: string }[] } }[];
    };
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== 'string') {
      throw new AIProviderError(this.name, 'no content in response');
    }
    return { provider: this.name, raw: text };
  }
}
