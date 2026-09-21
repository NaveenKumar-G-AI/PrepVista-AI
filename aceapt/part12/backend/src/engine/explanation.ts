import { InterventionDecision } from '../domain/types';
import { INTERVENTION_CATALOG } from '../domain/interventionCatalog';

/**
 * The deterministic template is the real explanation — it is built entirely
 * from the DetectedProblem's own evidence and reason, and from static
 * catalog metadata. Nothing here is invented (Section 49: no false precision;
 * Section 46: no magic AI). This function never fails and never needs a key.
 */
export function buildDeterministicExplanation(decision: InterventionDecision): string {
  const meta = INTERVENTION_CATALOG[decision.selected.type];
  const name = meta?.displayName ?? decision.selected.type;
  const duration = meta?.typicalDurationMin;
  const durationClause = duration ? `${duration}-minute ` : '';
  const focus = meta?.description ?? '';
  return `${decision.problem.reason} ACEAPT is giving you a ${durationClause}${name.toLowerCase()}. ${focus}`.trim();
}

interface LLMRefineOptions {
  apiKey?: string;
}

/**
 * Optionally rephrases the deterministic explanation more naturally via the
 * Anthropic API. Only runs if an API key is configured (it is blank by
 * default in .env.example — see README); on any missing key, network error,
 * or bad response it falls back to the deterministic text, so the product
 * never depends on a live LLM call to function. The model is explicitly
 * told to use ONLY the facts it's given — it rephrases, it doesn't decide.
 */
export async function refineExplanation(decision: InterventionDecision, opts: LLMRefineOptions = {}): Promise<string> {
  const deterministic = buildDeterministicExplanation(decision);
  const apiKey = opts.apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return deterministic;

  try {
    const res: any = await (globalThis as any).fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 200,
        system:
          'Rephrase the given explanation in a warm, plain-spoken way for a student. ' +
          'Use ONLY the facts provided. Do not invent numbers, add claims, or predict a score improvement.',
        messages: [{ role: 'user', content: deterministic }]
      })
    });
    if (!res.ok) return deterministic;
    const data: any = await res.json();
    const text = data?.content?.find((b: { type: string }) => b.type === 'text')?.text;
    return typeof text === 'string' && text.trim().length > 0 ? text.trim() : deterministic;
  } catch {
    return deterministic;
  }
}
