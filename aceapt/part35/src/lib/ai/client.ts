import Anthropic from '@anthropic-ai/sdk';

const DEFAULT_MODEL = 'claude-sonnet-5';

let client: Anthropic | null | undefined;

function getClient(): Anthropic | null {
  if (client !== undefined) return client;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  client = apiKey ? new Anthropic({ apiKey }) : null;
  return client;
}

// Every AI call in this app goes through here. It NEVER throws — Section 57
// requires the feature to keep working with AI down, so failure just means
// "no narrative today", not a broken page. Callers always have a
// deterministic fallback ready before they call this.
export async function callAIForJSON<T>(system: string, userContent: string): Promise<T | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create({
      model: process.env.AI_MODEL || DEFAULT_MODEL,
      max_tokens: 1000,
      system,
      messages: [{ role: 'user', content: userContent }],
    });

    const textBlock = response.content.find((block) => block.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;

    const cleaned = textBlock.text.replace(/```json/g, '').replace(/```/g, '').trim();
    return JSON.parse(cleaned) as T;
  } catch {
    // Network error, timeout, invalid JSON, rate limit — all treated the same:
    // the deterministic layer already has everything it needs without this.
    return null;
  }
}

export function isAIConfigured(): boolean {
  return getClient() !== null;
}
