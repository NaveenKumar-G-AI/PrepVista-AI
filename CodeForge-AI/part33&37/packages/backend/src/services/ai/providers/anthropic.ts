import Anthropic from '@anthropic-ai/sdk';
import { AIProvider, AIRequest, AIResponse, CostEstimate } from '../types';

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'claude-3-5-sonnet-20241022': { input: 3.00, output: 15.00 }, // per 1M tokens
  'claude-3-5-haiku-20241022': { input: 0.80, output: 4.00 },
  'claude-3-opus-20240229': { input: 15.00, output: 75.00 },
  'claude-3-sonnet-20240229': { input: 3.00, output: 15.00 },
  'claude-3-haiku-20240307': { input: 0.25, output: 1.25 },
};

export class AnthropicProvider implements AIProvider {
  name = 'anthropic';
  models = ['claude-3-5-sonnet-20241022', 'claude-3-5-haiku-20241022', 'claude-3-opus-20240229', 'claude-3-sonnet-20240229', 'claude-3-haiku-20240307'];
  defaultModel = 'claude-3-5-sonnet-20241022';
  supportsStructuredOutput = true;
  maxTokens = 8192;

  private client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const model = request.model || this.defaultModel;
    const temperature = request.temperature ?? 0.3;
    const maxTokens = request.maxTokens || 4096;

    const messages = request.messages.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content,
    }));

    // Handle system message separately
    const systemMessage = messages.find(m => m.role === 'system');
    const userMessages = messages.filter(m => m.role !== 'system');

    const response = await this.client.messages.create({
      model,
      system: systemMessage?.content,
      messages: userMessages,
      temperature,
      max_tokens: maxTokens,
      ...(request.responseFormat === 'json' && {
        response_format: { type: 'json_object' },
      }),
    });

    const content = response.content[0]?.type === 'text' ? response.content[0].text : '';
    if (!content) {
      throw new Error('Empty response from Anthropic');
    }

    return {
      content,
      usage: {
        promptTokens: response.usage.input_tokens,
        completionTokens: response.usage.output_tokens,
        totalTokens: response.usage.input_tokens + response.usage.output_tokens,
      },
      model: response.model,
      finishReason: response.stop_reason || 'stop',
    };
  }

  estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token for English
    return Math.ceil(text.length / 4);
  }

  estimateCost(request: AIRequest): CostEstimate {
    const model = request.model || this.defaultModel;
    const pricing = MODEL_PRICING[model] || MODEL_PRICING[this.defaultModel];

    const promptTokens = request.messages.reduce((sum, m) => sum + this.estimateTokens(m.content), 0);
    const estimatedCompletionTokens = request.maxTokens || 2000;

    return {
      estimatedPromptTokens: promptTokens,
      estimatedCompletionTokens,
      estimatedCostUsd: (promptTokens * pricing.input + estimatedCompletionTokens * pricing.output) / 1_000_000,
    };
  }
}