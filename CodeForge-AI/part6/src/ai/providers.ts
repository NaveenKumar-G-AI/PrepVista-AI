import type { AIProvider, ExplanationOutput, GroundedExplanationContext } from './provider';

/**
 * NOTE: this sandbox's outbound network policy only allows package
 * registries (npm/pip/crates/apt) and github.com — it has no route to
 * api.groq.com or generativelanguage.googleapis.com. These implementations
 * are real and correct for a deployment that *does* have that route (set
 * GROQ_API_KEY / GEMINI_API_KEY there); in this environment they simply stay
 * unconfigured and the system runs on DeterministicFallbackProvider, which
 * is the truthful, demonstrable mode for this build. See docs/ARCHITECTURE.md.
 */

const JSON_INSTRUCTION =
  'Respond with ONLY a JSON object of the form {"summary": string, "reason": string}. No markdown, no preamble, no code fences.';

function buildPrompt(ctx: GroundedExplanationContext): string {
  return [
    'You are rephrasing an already-computed, factual explanation for a student-facing learning roadmap.',
    'Do not invent facts. Do not change the meaning. Only make the phrasing warmer and clearer.',
    `Skill: ${ctx.skillName}`,
    `Gap status: ${ctx.gapStatus}`,
    `Target mastery: ${ctx.targetMastery}`,
    `Learning objective: ${ctx.learningObjective}`,
    `Deterministic explanation (ground truth, do not contradict): ${ctx.deterministicExplanation}`,
    JSON_INSTRUCTION,
  ].join('\n');
}

function tryParseJson(text: string): unknown | null {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export class GroqProvider implements AIProvider {
  name = 'groq';
  private apiKey = process.env.GROQ_API_KEY;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async polishExplanation(ctx: GroundedExplanationContext): Promise<ExplanationOutput | null> {
    if (!this.apiKey) return null;
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: buildPrompt(ctx) }],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const text = data.choices?.[0]?.message?.content;
    if (!text) return null;
    return tryParseJson(text) as ExplanationOutput | null;
  }
}

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  private apiKey = process.env.GEMINI_API_KEY;

  isConfigured(): boolean {
    return Boolean(this.apiKey);
  }

  async polishExplanation(ctx: GroundedExplanationContext): Promise<ExplanationOutput | null> {
    if (!this.apiKey) return null;
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts: [{ text: buildPrompt(ctx) }] }] }),
      }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) return null;
    return tryParseJson(text) as ExplanationOutput | null;
  }
}
