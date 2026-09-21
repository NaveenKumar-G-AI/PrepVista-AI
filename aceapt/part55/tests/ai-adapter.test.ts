import { describe, it, expect, afterEach } from 'vitest';
import { InitialDifficultyAiAdapter } from '../src/ai/initial-difficulty-ai.adapter.js';

describe('InitialDifficultyAiAdapter', () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  afterEach(() => {
    if (originalKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = originalKey;
  });

  it('§203: falls back to the deterministic template when no API key is configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    const adapter = new InitialDifficultyAiAdapter();
    const result = await adapter.estimate({
      questionText: 'What is 20% of 50?',
      skillName: 'Percentages',
      purpose: 'PRACTICE',
      structuralScore: 0.3,
    });
    expect(result.source).toBe('fallback_template');
    expect(result.score).toBe(0.3); // pass-through of structuralScore
  });

  it('§203: falls back gracefully on a REAL 401 from the live Anthropic API (not mocked)', async () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-deliberately-invalid-key-for-testing';
    const adapter = new InitialDifficultyAiAdapter();
    const result = await adapter.estimate({
      questionText: 'A shop raises then lowers price by x% and y%...',
      skillName: 'Percentages',
      purpose: 'PRACTICE',
      structuralScore: 0.6,
    });
    expect(result.source).toBe('fallback_template');
    expect(result.score).toBe(0.6);
    expect(result.rationale).toMatch(/deterministic fallback/i);
  });
});
