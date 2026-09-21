import Anthropic from '@anthropic-ai/sdk';
import { APP_CONFIG } from '../config';

let client: Anthropic | null = null;

export function isAiConfigured(): boolean {
  return APP_CONFIG.ANTHROPIC_API_KEY.trim().length > 0;
}

function getClient(): Anthropic {
  if (!client) {
    client = new Anthropic({ apiKey: APP_CONFIG.ANTHROPIC_API_KEY });
  }
  return client;
}

/**
 * Generates a short piece of text with Claude. Callers MUST have their own
 * deterministic fallback and MUST NOT let a failure here propagate as a
 * user-facing error — see explanationEngine.ts. This function only ever
 * produces explanatory text; it never decides retention state, evidence
 * weighting, or scheduling (that stays deterministic per spec section 48).
 */
export async function generateShortText(prompt: string, maxTokens = 220): Promise<string | null> {
  if (!isAiConfigured()) return null;
  try {
    const response = await getClient().messages.create({
      model: APP_CONFIG.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });
    const text = response.content
      .filter((block): block is Anthropic.TextBlock => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
      .trim();
    return text.length > 0 ? text : null;
  } catch (err) {
    console.warn('[anthropicClient] generateShortText failed, caller will use fallback:', (err as Error).message);
    return null;
  }
}
