/**
 * SS58 AI Explanation Engine, SS41 Student-Facing Language.
 *
 * Turns *already-computed* structured evidence into a short, warm,
 * plain-language explanation. This service NEVER computes a number and
 * NEVER invents evidence - it only rephrases what generateForecast()
 * already decided. It has a deterministic fallback so the product
 * keeps working with ANTHROPIC_API_KEY unset (see .env.example).
 */

export interface ExplanationInput {
  readiness: number | null;
  target: number | null;
  trajectory: string;
  confidence: string;
  risks: string[];
  strengths: string[];
  bottleneck: string | null;
}

const SYSTEM_PROMPT = `You are ACEAPT's forecast explanation writer.
You will receive ONLY structured evidence as JSON. Rewrite it into 2-4
short, warm, plain-language sentences for a student preparing for an
aptitude assessment.

Rules:
- Use ONLY the facts in the JSON. Never invent a number, skill, or
  risk that is not present.
- Never use technical/statistical jargon (e.g. "regression",
  "posterior", "coefficient of variation", "z-score"). Say what it
  means in plain language instead.
- Never promise a guaranteed outcome ("you will pass", "you will
  definitely reach..."). Describe direction and trajectory, not
  certainty.
- If confidence is INSUFFICIENT_EVIDENCE, say so plainly and encourage
  continued practice rather than describing a trend.
- Output plain sentences only. No headers, no bullet points, no JSON.`;

// Verify current model IDs at
// https://docs.claude.com/en/docs/about-claude/models/overview before
// deploying - these change over time. See also
// /mnt/skills/public/product-self-knowledge/SKILL.md.
const DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5';

export async function explainForecast(input: ExplanationInput): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return deterministicFallback(input);
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: JSON.stringify(input) }],
      }),
    });

    if (!response.ok) {
      console.error(`AI explanation call failed: ${response.status} ${await response.text()}`);
      return deterministicFallback(input);
    }

    const data = (await response.json()) as { content?: { type: string; text?: string }[] };
    const text = (data.content ?? [])
      .filter((b) => b.type === 'text' && b.text)
      .map((b) => b.text)
      .join(' ')
      .trim();

    return text || deterministicFallback(input);
  } catch (err) {
    console.error('AI explanation call threw', err);
    return deterministicFallback(input);
  }
}

/**
 * No-AI-available template - keeps the product fully functional without
 * a key. Expects `input` to already be humanized (see
 * ai/explanationInput.ts) - this function does not know how to
 * translate raw codes on its own, unlike a real Claude call.
 */
function deterministicFallback(input: ExplanationInput): string {
  if (input.confidence === 'INSUFFICIENT_EVIDENCE' || input.readiness === null) {
    return "There isn't enough evidence yet to describe a trend. Keep training and checking in - the forecast will sharpen as more results come in.";
  }
  const parts: string[] = [];
  parts.push(`Your current readiness is ${input.readiness}%${input.target ? `, with a target of ${input.target}%` : ''}.`);
  if (input.strengths.length) parts.push(`Recent strengths include ${input.strengths.join(' and ')}.`);
  if (input.bottleneck) parts.push(`Right now, ${input.bottleneck.replace(/_/g, ' ')} is the biggest factor limiting readiness.`);
  if (input.risks.length) parts.push(`Areas to watch: ${input.risks.join(', ')}.`);
  parts.push(`The system's confidence in this forecast is currently ${input.confidence.toLowerCase()}.`);
  return parts.join(' ');
}
