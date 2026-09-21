import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';

/**
 * Every classification, severity, confidence level, and score in Feature 40
 * is computed in src/lib and src/services using deterministic logic BEFORE
 * this module is ever called (spec ??107 "No Fake Data", ??108 "No Fake AI",
 * ??109 "No Black Box Scores"). This module's only job is turning already-
 * decided structured data into readable prose. That split means:
 *   - Leaving ANTHROPIC_API_KEY blank does not break Feature 40 -- every
 *     endpoint still returns correct, fully-classified data with clear
 *     template-generated explanations.
 *   - An AI outage never produces a wrong classification, only plainer
 *     wording (spec ??88 AI FAILURE: "DO NOT invent an answer").
 */

export interface AIRequest {
  systemPrompt: string;
  userPrompt: string;
  maxTokens?: number;
}

export interface AIResult {
  text: string;
  source: 'AI' | 'DETERMINISTIC_FALLBACK';
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: env.ai.apiKey });
  }
  return client;
}

export async function generateWithFallback(request: AIRequest, fallback: () => string): Promise<AIResult> {
  if (!env.ai.enabled) {
    return { text: fallback(), source: 'DETERMINISTIC_FALLBACK' };
  }
  try {
    const anthropic = getClient();
    const response = await anthropic.messages.create({
      model: env.ai.model,
      max_tokens: request.maxTokens ?? 400,
      system: request.systemPrompt,
      messages: [{ role: 'user', content: request.userPrompt }],
    });
    const text = response.content
      .map((block) => (block.type === 'text' ? block.text : ''))
      .join('')
      .trim();
    if (!text) return { text: fallback(), source: 'DETERMINISTIC_FALLBACK' };
    return { text, source: 'AI' };
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('[aiClient] AI call failed, using deterministic fallback:', (err as Error).message);
    return { text: fallback(), source: 'DETERMINISTIC_FALLBACK' };
  }
}
