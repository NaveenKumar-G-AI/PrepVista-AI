import { AIProvider, AICompletionRequest, RawAIResult, AIProviderError } from '../aiProvider';

export interface GroqProviderConfig {
  apiKey: string;
  model?: string;
  baseUrl?: string;
}

/**
 * Groq's chat completions endpoint (OpenAI-compatible shape) as of this
 * writing. api.groq.com isn't reachable from the sandbox this was built in,
 * so this class is written to spec and unit-tested via the AIProvider
 * interface (see aiProvider.test.ts) rather than against a live call.
 * Confirm GROQ_MODEL against https://console.groq.com/docs/models before
 * deploying — Groq's supported model list changes over time.
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private apiKey: string;
  private model: string;
  private baseUrl: string;

  constructor(config: GroqProviderConfig) {
    if (!config.apiKey) throw new Error('GroqProvider requires an apiKey');
    this.apiKey = config.apiKey;
    this.model = config.model ?? process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
    this.baseUrl = config.baseUrl ?? 'https://api.groq.com/openai/v1/chat/completions';
  }

  async complete(request: AICompletionRequest): Promise<RawAIResult> {
    let response: Response;
    try {
      response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          temperature: 0.3,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: request.systemPrompt },
            { role: 'user', content: request.userPrompt },
          ],
        }),
      });
    } catch (err) {
      throw new AIProviderError(this.name, 'network error', err);
    }

    if (!response.ok) {
      throw new AIProviderError(this.name, `HTTP ${response.status}: ${await response.text()}`);
    }
    const body = (await response.json()) as { choices?: { message?: { content?: string } }[] };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') {
      throw new AIProviderError(this.name, 'no content in response');
    }
    return { provider: this.name, raw: text };
  }
}
