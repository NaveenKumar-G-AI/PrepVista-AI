// Real-but-unexercised Groq adapter — matches the pattern used across every
// prior part of this project: a genuine HTTP call shape against Groq's
// OpenAI-compatible endpoint, gated behind an env var left blank here per
// instruction, with a deterministic fallback that runs whenever the key is
// absent or the call fails. AI is used ONLY to turn an already-deterministic
// result into a warmer paragraph — never to decide status, score, or
// confidence (Sections 44-45). Tests exercise the fallback and the contract
// via SimulatedExplanationAdapter, not this file — see TRUTH_TABLE.md.

import type { VerificationResult } from '../domain/types.js';

export interface ExplanationAdapter {
  explain(result: VerificationResult, studentFirstName?: string): Promise<string>;
}

const GROQ_API_KEY = process.env.PROOF_GROQ_API_KEY ?? ''; // fill in your key
const GROQ_MODEL = process.env.PROOF_GROQ_MODEL ?? 'llama-3.3-70b-versatile';
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/** Section 17 — no false guarantees, ever. Section 60 — calm, factual
 *  microcopy. This is the always-available baseline; the Groq call above it
 *  can only restate, never override, what this produces. */
export function deterministicExplanation(result: VerificationResult): string {
  const failing = result.factors.filter((f) => !f.meetsRequirement);
  if (result.status === 'VERIFIED' || result.status === 'STRONGLY_VERIFIED') {
    return `Your demonstrated performance currently meets the configured readiness criteria for this target, at ${result.confidence.toLowerCase()} evidence confidence.`;
  }
  if (!failing.length) {
    return 'Your evidence is trending in the right direction but does not yet clear every configured requirement.';
  }
  const primary = failing[0];
  return `Readiness not yet verified. The main blocker is ${primary?.name.toLowerCase() ?? 'unclear'}: ${primary?.explanation ?? ''}`.trim();
}

function buildPrompt(result: VerificationResult, studentFirstName?: string): string {
  const lines = result.factors.map(
    (f) => `- ${f.name}: ${(f.score * 100).toFixed(0)}% (needs ${(f.threshold * 100).toFixed(0)}%) — ${f.meetsRequirement ? 'meets' : 'below'} requirement`,
  );
  return [
    `Student: ${studentFirstName ?? 'the student'}`,
    `Status: ${result.status}`,
    `Confidence: ${result.confidence}`,
    'Factors:',
    ...lines,
  ].join('\n');
}

export class GroqExplanationAdapter implements ExplanationAdapter {
  async explain(result: VerificationResult, studentFirstName?: string): Promise<string> {
    const fallback = deterministicExplanation(result);
    if (!GROQ_API_KEY) return fallback;

    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          temperature: 0.4,
          max_tokens: 220,
          messages: [
            {
              role: 'system',
              content: 'You restate a readiness-verification result in plain, calm, encouraging language. '
                + 'You NEVER change the status, the numbers, or invent evidence. '
                + 'You NEVER say "guaranteed", "definitely", or promise an outcome. Two sentences maximum.',
            },
            { role: 'user', content: buildPrompt(result, studentFirstName) },
          ],
        }),
      });
      if (!res.ok) return fallback;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const text = data.choices?.[0]?.message?.content?.trim();
      return text && text.length > 0 ? text : fallback;
    } catch {
      return fallback; // a network or parsing failure must never block a result from rendering
    }
  }
}
