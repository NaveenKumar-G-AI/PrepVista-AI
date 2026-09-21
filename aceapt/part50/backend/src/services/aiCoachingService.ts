// AI is used ONLY to rephrase coaching language that the deterministic
// trainingPolicy has already decided (spec section 79: never for timing,
// averages, accuracy, pace, or state transitions). If AI is disabled,
// unconfigured, or the call fails for any reason, the deterministic message
// is returned unchanged - core speed training never depends on this
// succeeding (spec 80, 144).

import { TrainingPolicyDecision } from '../types/domain';

export interface AiCoachingService {
  enrich(decision: TrainingPolicyDecision): Promise<string>;
}

export interface AiCoachingConfig {
  apiKey?: string;
  model?: string;
  enabled: boolean;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const SYSTEM_PROMPT =
  'You are a calm, encouraging aptitude-test speed coach. Rewrite the given ' +
  'coaching note in 1-2 short sentences for the student. Never say "too slow", ' +
  '"you are rushing", or "failed". Never change the underlying recommendation ' +
  'or add a new one - only adjust the wording. Keep it specific and warm, not hype.';

export function createAiCoachingService(config: AiCoachingConfig): AiCoachingService {
  const fetchImpl = config.fetchImpl ?? fetch;

  return {
    async enrich(decision: TrainingPolicyDecision): Promise<string> {
      if (!config.enabled || !config.apiKey) {
        return decision.message;
      }

      try {
        const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': config.apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: config.model ?? 'claude-haiku-4-5-20251001',
            max_tokens: 200,
            system: SYSTEM_PROMPT,
            messages: [
              {
                role: 'user',
                content: `Signal: ${decision.signal}\nDeterministic note: ${decision.message}\nEvidence: ${decision.evidence.join(' ')}`,
              },
            ],
          }),
        });

        if (!response.ok) return decision.message;

        const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
        const text = data.content?.find((c) => c.type === 'text')?.text?.trim();
        return text && text.length > 0 ? text : decision.message;
      } catch {
        // AI failure must never break core functionality (spec 144).
        return decision.message;
      }
    },
  };
}
