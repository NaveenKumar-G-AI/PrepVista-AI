/**
 * The engine (src/engine/*) already produces plain-language "why" bullets
 * deterministically — that text is the source of truth and is always
 * correct on its own. This module is a strictly optional cosmetic layer
 * that can rephrase those bullets more naturally using an LLM, subject to
 * hard constraints:
 *
 *   - It NEVER changes the number of bullets, their order, or their meaning.
 *   - It is asked to add zero new facts, numbers, or claims.
 *   - Any failure (network error, bad response shape, missing key) falls
 *     back to the deterministic wording silently — the student never sees
 *     a broken or fabricated explanation (brief, sections 36-37, 53).
 *
 * Defaults to the deterministic passthrough. Only activates the AI path
 * when EXPLANATION_PROVIDER=anthropic and ANTHROPIC_API_KEY are both set.
 */

export interface ExplanationContext {
  roleName: string;
  state: string;
}

export interface ExplanationProvider {
  explain(reasons: string[], context: ExplanationContext): Promise<string[]>;
}

export class DeterministicExplanationProvider implements ExplanationProvider {
  async explain(reasons: string[]): Promise<string[]> {
    return reasons;
  }
}

const ANTHROPIC_MESSAGES_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_MODEL = 'claude-haiku-4-5-20251001';

const SYSTEM_PROMPT = [
  "You rephrase short, factual bullet points about a student's career readiness into warmer, plain-language sentences.",
  'Rules: never add a fact, number, or claim that is not already present in the input bullets.',
  'Never invent evidence, scores, or outcomes. Keep exactly the same number of bullets, in the same order, with the same meaning.',
  'Return ONLY a JSON array of strings, nothing else — no markdown fences, no commentary.',
].join(' ');

export class AnthropicExplanationProvider implements ExplanationProvider {
  constructor(private readonly apiKey: string, private readonly fallback: ExplanationProvider = new DeterministicExplanationProvider()) {}

  async explain(reasons: string[], context: ExplanationContext): Promise<string[]> {
    if (reasons.length === 0) return reasons;

    try {
      const response = await fetch(ANTHROPIC_MESSAGES_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: ANTHROPIC_MODEL,
          max_tokens: 400,
          system: SYSTEM_PROMPT,
          messages: [{ role: 'user', content: JSON.stringify({ roleName: context.roleName, state: context.state, bullets: reasons }) }],
        }),
      });

      if (!response.ok) throw new Error(`Anthropic API responded with ${response.status}`);

      const data: unknown = await response.json();
      const text = extractText(data);
      const parsed: unknown = JSON.parse(text);

      if (!isSameShapeStringArray(parsed, reasons.length)) {
        throw new Error('AI explanation response did not match the expected shape');
      }

      return parsed;
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn('[feature-37] AI explanation provider failed, falling back to deterministic wording', err);
      return this.fallback.explain(reasons, context);
    }
  }
}

function extractText(data: unknown): string {
  if (typeof data !== 'object' || data === null || !('content' in data)) return '';
  const content = (data as { content?: unknown }).content;
  if (!Array.isArray(content)) return '';
  const textBlock = content.find((b) => typeof b === 'object' && b !== null && (b as { type?: unknown }).type === 'text');
  return typeof textBlock === 'object' && textBlock !== null && typeof (textBlock as { text?: unknown }).text === 'string'
    ? (textBlock as { text: string }).text
    : '';
}

function isSameShapeStringArray(value: unknown, expectedLength: number): value is string[] {
  return Array.isArray(value) && value.length === expectedLength && value.every((v) => typeof v === 'string' && v.trim().length > 0);
}

export function buildExplanationProvider(): ExplanationProvider {
  const provider = process.env.EXPLANATION_PROVIDER ?? 'deterministic';
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (provider === 'anthropic' && apiKey) {
    return new AnthropicExplanationProvider(apiKey);
  }
  return new DeterministicExplanationProvider();
}
