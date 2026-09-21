/**
 * AI-assisted initial difficulty estimate — one of several INITIAL DIFFICULTY
 * inputs (§11, §92: "a hypothesis, not empirical truth"). Calls the real
 * Anthropic API when ANTHROPIC_API_KEY is set; otherwise (or on any
 * failure — missing key, network error, non-200, malformed JSON) falls back
 * to a deterministic template derived from the structural score alone.
 *
 * §203 ("TEST — AI FAILURE") is explicit: if the AI estimator is
 * unavailable, empirical/deterministic mechanisms must continue. This
 * adapter is the boundary that guarantees that — it never throws, and a
 * caller can always trust it to return *something* usable.
 */

export interface AiDifficultyEstimate {
  score: number; // 0..1, higher = harder
  rationale: string;
  source: 'anthropic' | 'fallback_template';
}

export interface InitialDifficultyAiInput {
  questionText: string;
  skillName: string | null;
  purpose: string;
  structuralScore: number; // 0..1, already computed — the AI is asked to sanity-check/refine it, not invent from nothing
}

const MODEL = process.env.ANTHROPIC_MODEL ?? 'claude-haiku-4-5-20251001';
const TIMEOUT_MS = 8000;

export class InitialDifficultyAiAdapter {
  async estimate(input: InitialDifficultyAiInput): Promise<AiDifficultyEstimate> {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return this.fallback(input, 'no ANTHROPIC_API_KEY configured');
    }

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 300,
          system:
            'You estimate the INITIAL, PRE-EVIDENCE difficulty of an aptitude-test question for placement-preparing undergraduate students. ' +
            'This is a rough starting hypothesis only — it will be replaced by real student performance data once enough attempts exist. ' +
            'Respond with ONLY a JSON object, no markdown fences, no preamble: {"score": <number 0-1, higher = harder>, "rationale": "<one short sentence>"}.',
          messages: [
            {
              role: 'user',
              content: `Skill: ${input.skillName ?? 'unknown'}\nPurpose: ${input.purpose}\nStructural complexity score (already computed from steps/variables/constraints, 0-1): ${input.structuralScore.toFixed(2)}\nQuestion:\n${input.questionText.slice(0, 2000)}`,
            },
          ],
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) {
        return this.fallback(input, `Anthropic API returned HTTP ${response.status}`);
      }

      const data = (await response.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (data.content ?? []).find((b) => b.type === 'text')?.text;
      if (!text) return this.fallback(input, 'no text block in Anthropic response');

      const cleaned = text.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned) as { score?: number; rationale?: string };
      if (typeof parsed.score !== 'number' || Number.isNaN(parsed.score)) {
        return this.fallback(input, 'Anthropic response did not contain a numeric score');
      }

      return {
        score: Math.max(0, Math.min(1, parsed.score)),
        rationale: parsed.rationale?.slice(0, 500) ?? 'No rationale provided.',
        source: 'anthropic',
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return this.fallback(input, message);
    }
  }

  private fallback(input: InitialDifficultyAiInput, _reason: string): AiDifficultyEstimate {
    return {
      score: input.structuralScore,
      rationale:
        'Deterministic fallback: estimated from structural complexity signals (steps, variables, constraints, reading length) only — no AI rationale available.',
      source: 'fallback_template',
    };
  }
}
