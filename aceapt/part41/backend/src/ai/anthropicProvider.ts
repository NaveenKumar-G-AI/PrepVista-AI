import Anthropic from '@anthropic-ai/sdk';
import type { LLMProvider } from './llmProvider.js';

/**
 * Reference LLMProvider backed by the real Anthropic API.
 * Model strings current as of this build: 'claude-sonnet-5' (default here —
 * good balance for the reasoning/explanation this module asks for) or
 * 'claude-haiku-4-5-20251001' for a cheaper/faster option if you want to
 * downgrade this particular call path (spec #71: cost control — reserve the
 * larger model for genuinely complex reasoning). Confirm current model IDs
 * against https://docs.claude.com before changing defaults.
 */
export class AnthropicLLMProvider implements LLMProvider {
  private client: Anthropic | null;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = apiKey ? new Anthropic({ apiKey }) : null;
    this.model = model;
  }

  get isAvailable(): boolean {
    return this.client !== null;
  }

  async complete(systemPrompt: string, userPrompt: string): Promise<string> {
    if (!this.client) {
      throw new Error('AnthropicLLMProvider constructed without an API key.');
    }
    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });
    const textBlock = response.content.find((b): b is Anthropic.TextBlock => b.type === 'text');
    if (!textBlock) throw new Error('No text content returned from the model.');
    return textBlock.text;
  }
}
