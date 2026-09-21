/**
 * AI Service Tests
 * Tests for AI orchestration, structured output parsing, validation, and cost tracking
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AIService } from './index';
import { AnthropicProvider } from './providers/anthropic';
import { OpenAIProvider } from './providers/openai';
import { explainableScoreSchema, weaknessSchema, recommendationSchema } from '@prepvista/shared';

// Mock providers
vi.mock('./providers/anthropic', () => ({
  AnthropicProvider: vi.fn().mockImplementation(() => ({
    name: 'anthropic',
    models: ['claude-3-5-sonnet-20241022'],
    defaultModel: 'claude-3-5-sonnet-20241022',
    supportsStructuredOutput: true,
    maxTokens: 8192,
    generate: vi.fn(),
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
    estimateCost: vi.fn().mockReturnValue({
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 500,
      estimatedCostUsd: 0.001,
    }),
  })),
}));

vi.mock('./providers/openai', () => ({
  OpenAIProvider: vi.fn().mockImplementation(() => ({
    name: 'openai',
    models: ['gpt-4o-mini'],
    defaultModel: 'gpt-4o-mini',
    supportsStructuredOutput: true,
    maxTokens: 4096,
    generate: vi.fn(),
    estimateTokens: vi.fn((text: string) => Math.ceil(text.length / 4)),
    estimateCost: vi.fn().mockReturnValue({
      estimatedPromptTokens: 100,
      estimatedCompletionTokens: 500,
      estimatedCostUsd: 0.0005,
    }),
  })),
}));

vi.mock('../../lib/prisma', () => ({
  prisma: {
    aIProcessingJob: {
      create: vi.fn().mockResolvedValue({}),
    },
  },
}));

vi.mock('../../lib/logger', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

describe('AIService', () => {
  let service: AIService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AIService();
  });

  describe('parseAndValidate', () => {
    it('should parse valid JSON', () => {
      const content = '{"score": 85, "feedback": "Good job"}';
      const schema = {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { score: 85, feedback: 'Good job' },
        }),
      };

      const result = service['parseAndValidate'](content, schema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ score: 85, feedback: 'Good job' });
    });

    it('should extract JSON from markdown code blocks', () => {
      const content = '```json\n{"score": 85, "feedback": "Good job"}\n```';
      const schema = {
        safeParse: vi.fn().mockReturnValue({
          success: true,
          data: { score: 85, feedback: 'Good job' },
        }),
      };

      const result = service['parseAndValidate'](content, schema);
      expect(result.success).toBe(true);
      expect(result.data).toEqual({ score: 85, feedback: 'Good job' });
    });

    it('should handle validation failures', () => {
      const content = '{"score": 150}'; // Invalid: score > 100
      const schema = {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { message: 'Score must be <= 100' },
        }),
      };

      const result = service['parseAndValidate'](content, schema);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Validation failed');
    });

    it('should handle parse failures', () => {
      const content = 'not valid json';
      const schema = {
        safeParse: vi.fn().mockReturnValue({
          success: false,
          error: { message: 'Parse error' },
        }),
      };

      const result = service['parseAndValidate'](content, schema);
      expect(result.success).toBe(false);
      expect(result.error).toContain('Parse failed');
    });
  });

  describe('hashInput', () => {
    it('should produce consistent hashes for same input', () => {
      const input = { question: 'test', answer: 'answer' };
      const hash1 = service['hashInput'](input);
      const hash2 = service['hashInput'](input);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', () => {
      const hash1 = service['hashInput']({ a: 1 });
      const hash2 = service['hashInput']({ a: 2 });
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('Provider selection', () => {
    it('should use default provider when none specified', () => {
      const provider = service['getProvider']();
      expect(provider.name).toBe('anthropic');
    });

    it('should throw for unconfigured provider', () => {
      expect(() => service['getProvider']('nonexistent')).toThrow("AI provider 'nonexistent' not configured");
    });
  });
});

describe('AnthropicProvider', () => {
  let provider: AnthropicProvider;

  beforeEach(() => {
    provider = new AnthropicProvider('test-key');
  });

  describe('estimateTokens', () => {
    it('should estimate tokens roughly', () => {
      expect(provider.estimateTokens('')).toBe(0);
      expect(provider.estimateTokens('hello')).toBe(2); // 5 chars / 4 = 1.25 -> 2
      expect(provider.estimateTokens('a'.repeat(100))).toBe(25);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost based on model pricing', () => {
      const request = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'claude-3-5-sonnet-20241022',
        maxTokens: 1000,
      };

      const cost = provider.estimateCost(request);
      expect(cost.estimatedPromptTokens).toBeGreaterThan(0);
      expect(cost.estimatedCompletionTokens).toBe(1000);
      expect(cost.estimatedCostUsd).toBeGreaterThan(0);
    });
  });
});

describe('OpenAIProvider', () => {
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider('test-key');
  });

  describe('estimateTokens', () => {
    it('should estimate tokens roughly', () => {
      expect(provider.estimateTokens('')).toBe(0);
      expect(provider.estimateTokens('hello')).toBe(2);
      expect(provider.estimateTokens('a'.repeat(100))).toBe(25);
    });
  });

  describe('estimateCost', () => {
    it('should calculate cost based on model pricing', () => {
      const request = {
        messages: [{ role: 'user', content: 'test' }],
        model: 'gpt-4o-mini',
        maxTokens: 1000,
      };

      const cost = provider.estimateCost(request);
      expect(cost.estimatedPromptTokens).toBeGreaterThan(0);
      expect(cost.estimatedCompletionTokens).toBe(1000);
      expect(cost.estimatedCostUsd).toBeGreaterThan(0);
    });
  });
});