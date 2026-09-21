import { config } from '../config/index.js';
import type { AIProvider } from './types.js';
import { NullProvider } from './nullProvider.js';
import { GroqProvider } from './groqProvider.js';
import { GeminiProvider } from './geminiProvider.js';

export function createAIProvider(): AIProvider {
  switch (config.ai.provider) {
    case 'groq':
      return new GroqProvider();
    case 'gemini':
      return new GeminiProvider();
    default:
      return new NullProvider();
  }
}

export type { AIProvider };
