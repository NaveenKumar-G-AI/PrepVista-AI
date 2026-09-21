import OpenAI from 'openai';
import { AIProvider, AIRequest, AIResponse, CostEstimate } from '../types';

const MODEL_PRICING: Record<string, { input: number; output: number }> = {
  'gpt-4o': { input: 5.00, output: 15.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'gpt-4-turbo': { input: 10.00, output: 30.00 },
  'gpt-3.5-turbo': { input: 0.50, output: 1.50 },
};

export class OpenAIProvider implements AIProvider {
  name = 'openai';
  models = ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'];
  defaultModel = 'gpt-4o-mini';
  supportsStructuredOutput = true;
  maxTokens = 4096;

  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async generate(request: AIRequest): Promise<AIResponse> {
    const model = request.model || this.defaultModel;
    const temperature = request.temperature ?? 0.3;
    const maxTokens = request.maxTokens || 4096;

    const messages = request.messages.map(m => ({
      role: m.role,
      content: m.content,
    }));

    const response = await this.client.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens: maxTokens,
      ...(request.responseFormat === 'json' && { response_format: { type: 'json_object' } }),
    });

    const content = response.choices[0]?.message?.content || '';
    if (!content) {
      throw new Error('Empty response from OpenAI');
    }

    return {
      content,
      usage: {
        promptTokens: response.usage?.prompt_tokens || 0,
        completionTokens: response.usage?.completion_tokens || 0,
        totalTokens: response.usage?.total_tokens || 0,
      },
      model: response.model,
      finishReason: response.choices[0]?.finish_reason || 'stop',
    };
  }

  estimateTokens(text: string): number {
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