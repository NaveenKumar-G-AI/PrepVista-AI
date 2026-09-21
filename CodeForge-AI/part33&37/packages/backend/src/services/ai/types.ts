/**
 * AI Service Types - Model-agnostic interfaces for AI operations.
 * Supports multiple providers with structured output validation.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface AIRequest {
  messages: AIMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'json' | 'text';
  schema?: Record<string, unknown>; // JSON schema for structured output
}

export interface AIResponse {
  content: string;
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
  model: string;
  finishReason: string;
}

export interface AIProvider {
  name: string;
  models: string[];
  defaultModel: string;
  supportsStructuredOutput: boolean;
  maxTokens: number;
  generate(request: AIRequest): Promise<AIResponse>;
  estimateTokens(text: string): number;
}

export interface AIJobInput {
  type: string;
  promptVersion: string;
  input: Record<string, unknown>;
  model?: string;
  temperature?: number;
}

export interface AIJobResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costUsd: number;
  };
  model: string;
  promptVersion: string;
}

export interface CostEstimate {
  estimatedPromptTokens: number;
  estimatedCompletionTokens: number;
  estimatedCostUsd: number;
}

export const PROMPT_VERSIONS = {
  QUESTION_GENERATION: 'v2.1.0',
  ANSWER_EVALUATION: 'v2.0.0',
  SCORING: 'v2.2.0',
  WEAKNESS_ANALYSIS: 'v1.3.0',
  RECOMMENDATION_GENERATION: 'v1.2.0',
  READINESS_CALCULATION: 'v1.1.0',
} as const;

export type PromptVersionKey = keyof typeof PROMPT_VERSIONS;