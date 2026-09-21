import { env } from '../config/env';

export interface AiProvider {
  generateText(prompt: string): Promise<string | null>;
}

class NoopAiProvider implements AiProvider {
  async generateText(): Promise<string | null> {
    return null;
  }
}

/**
 * Minimal client for Anthropic's Messages API
 * (POST https://api.anthropic.com/v1/messages, headers x-api-key +
 * anthropic-version). Model names change over time — set AI_MODEL in
 * your .env to whatever current model you want rather than relying on
 * a hardcoded default here; check
 * https://docs.claude.com/en/docs/about-claude/models for the current
 * list.
 */
class AnthropicAiProvider implements AiProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async generateText(prompt: string): Promise<string | null> {
    if (!this.model) {
      throw new Error('AI_MODEL must be set when AI_PROVIDER=anthropic. See docs.claude.com for current model names.');
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 400,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API request failed: ${response.status} ${await response.text()}`);
    }

    const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
    const textBlock = data.content?.find((block) => block.type === 'text');
    return textBlock?.text ?? null;
  }
}

export const aiProvider: AiProvider =
  env.AI_PROVIDER === 'anthropic' && env.AI_API_KEY ? new AnthropicAiProvider(env.AI_API_KEY, env.AI_MODEL) : new NoopAiProvider();
