import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/env.js';
import { GUIDED_SOLVING_SYSTEM_PROMPT, buildGuidancePrompt, type GuidanceRequestContext } from './prompts.js';
import { parseAiGuidanceOutput, type AiGuidanceOutput } from './outputSchema.js';

let client: Anthropic | null = null;

function getClient(): Anthropic | null {
  if (!env.anthropicApiKey) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropicApiKey });
  return client;
}

/**
 * Requests a piece of guidance copy from the model. Returns null on ANY
 * failure - missing key, network error, timeout, or output that fails the
 * schema (Section 66, Section 109, Section 110). Callers must always have a
 * deterministic fallback ready (see fallback.ts) and must never surface an
 * AI outage as a broken experience.
 */
export async function requestAiGuidance(ctx: GuidanceRequestContext): Promise<AiGuidanceOutput | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const message = await anthropic.messages.create(
      {
        model: env.anthropicModel,
        max_tokens: 400,
        system: GUIDED_SOLVING_SYSTEM_PROMPT,
        messages: [{ role: 'user', content: buildGuidancePrompt(ctx) }],
      },
      { timeout: env.anthropicTimeoutMs },
    );

    const textBlock = message.content.find((block): block is Anthropic.TextBlock => block.type === 'text');
    if (!textBlock) return null;

    return parseAiGuidanceOutput(textBlock.text);
  } catch {
    // Network error, timeout, rate limit, auth failure, etc. all collapse to
    // "no AI guidance available right now" - the caller's fallback handles it.
    return null;
  }
}
