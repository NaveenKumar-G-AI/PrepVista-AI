/**
 * Optional AIGateway backed by the Anthropic Messages API. Only used if
 * AI_GATEWAY_API_KEY is set (see src/config.ts); otherwise the system runs on
 * templateAIGateway (defaultPorts.ts), per §192 "AI FALLBACK".
 *
 * AI is used here strictly for the roles §191 allows: explaining a decision
 * after the fact, summarizing an already-computed pattern, and drafting a
 * training-scenario *draft* that still has to pass the validation pipeline in
 * §194 before anything serves it. It never decides scoring, never sees a live
 * formal-assessment answer key, and is never on the path that would let it
 * recommend an option to select during a protected assessment.
 */

import type { AIGateway, ExplainDecisionInput, ScenarioSpec, SummarizeInput } from '../ports';
import { config } from '../config';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

async function callClaude(system: string, userText: string): Promise<string> {
  if (!config.aiGateway.apiKey) {
    throw new Error('AI_GATEWAY_API_KEY is not set.');
  }
  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': config.aiGateway.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: config.aiGateway.model,
      max_tokens: 400,
      system,
      messages: [{ role: 'user', content: userText }],
    }),
  });
  if (!response.ok) {
    throw new Error(`AI gateway request failed: ${response.status} ${await response.text()}`);
  }
  const data = (await response.json()) as { content?: { type: string; text?: string }[] };
  const text = (data.content ?? [])
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text)
    .join('\n');
  if (!text) throw new Error('AI gateway returned no text content.');
  return text;
}

const EXPLAIN_SYSTEM_PROMPT = [
  'You explain a single exam decision to a student. Use only the information given.',
  'Never say the student "should have known" anything that was not available at decision time.',
  'Separate the quality of the decision process from whether the outcome was correct.',
  'Never use shaming language. Keep it to two or three short sentences.',
].join(' ');

const SUMMARIZE_SYSTEM_PROMPT = [
  'You summarize an aggregate decision-making pattern for a student, from already-computed stats.',
  'Be specific and actionable, never generic motivational language.',
  'Never claim certainty the sample size does not support. Keep it to two or three short sentences.',
].join(' ');

export const anthropicAIGateway: AIGateway = {
  async explainDecision(input: ExplainDecisionInput) {
    return callClaude(EXPLAIN_SYSTEM_PROMPT, JSON.stringify(input));
  },

  async summarizePatterns(input: SummarizeInput) {
    return callClaude(SUMMARIZE_SYSTEM_PROMPT, JSON.stringify(input));
  },

  async draftTrainingScenario(spec: ScenarioSpec) {
    const system = [
      'You draft a single decision-training scenario as JSON only, no prose.',
      'Fields: difficultyLevel (number), promptText (string), expectedTimeSeconds (number),',
      'options (array of 4 short strings). Do not include which option is correct —',
      'that must come from validated question content, never be invented here.',
    ].join(' ');
    const text = await callClaude(system, JSON.stringify(spec));
    try {
      return JSON.parse(text) as Record<string, unknown>;
    } catch {
      throw new Error('AI gateway did not return valid JSON for a scenario draft.');
    }
  },
};
