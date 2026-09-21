import { describe, expect, it } from 'vitest';
import type { AIProvider } from '../src/ai/AIProvider.js';
import { AIProviderRouter } from '../src/ai/AIProviderRouter.js';

const failingProvider = (name: string): AIProvider => ({
  name,
  async generateText() {
    throw new Error(`${name} is down`);
  },
});

describe('AIProviderRouter — PHASE 73 "AI must never be a single point of failure"', () => {
  it('falls back to deterministic text when every provider fails', async () => {
    const router = new AIProviderRouter([failingProvider('groq'), failingProvider('gemini')], (prompt) => `deterministic:${prompt}`);
    const { text, usedProvider } = await router.generateText('explain graphs');
    expect(usedProvider).toBe('deterministic-fallback');
    expect(text).toBe('deterministic:explain graphs');
  });

  it('uses the first healthy provider and never touches the fallback if one succeeds', async () => {
    const healthy: AIProvider = {
      name: 'gemini',
      async generateText(p) {
        return `ok:${p}`;
      },
    };
    const router = new AIProviderRouter([failingProvider('groq'), healthy], () => 'should-not-be-used');
    const { usedProvider, text } = await router.generateText('x');
    expect(usedProvider).toBe('gemini');
    expect(text).toBe('ok:x');
  });
});
