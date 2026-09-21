import { config } from '../config/index.js';
import type { AIProvider } from './types.js';
import { LearningObjectiveSchema, AmbiguousEvidenceInterpretationSchema, FeedbackExplanationSchema } from './schemas.js';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

/**
 * Talks to Groq's OpenAI-compatible chat completions endpoint. Requires
 * GROQ_API_KEY. NOTE: this reference build's sandbox network egress allow-
 * list does not include api.groq.com, so this code path cannot be exercised
 * live from this environment — see CODEFORGE_FINAL_REPORT.md for what WAS
 * verified (the request is correctly built, and the failure-to-reach-network
 * case correctly triggers the deterministic fallback, which was tested for
 * real). It will work as-is once deployed where api.groq.com is reachable
 * and GROQ_API_KEY is set.
 */
export class GroqProvider implements AIProvider {
  readonly name = 'groq';
  private apiKey = process.env.GROQ_API_KEY ?? '';

  private async callJSON<T>(systemPrompt: string, userPrompt: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): Promise<T | null> {
    if (!this.apiKey) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
    try {
      const res = await fetch(GROQ_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
        signal: controller.signal,
        body: JSON.stringify({
          model: config.ai.groqModel,
          messages: [
            { role: 'system', content: `${systemPrompt} Respond with ONLY a JSON object, no markdown fences, no preamble.` },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3,
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const raw = data.choices?.[0]?.message?.content;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      return result.success ? (result.data as T) : null;
    } catch {
      return null; // network error, timeout, abort, JSON parse failure -> caller falls back deterministically
    } finally {
      clearTimeout(timer);
    }
  }

  async generateLearningObjective(ctx: { deterministicObjective: string }): Promise<string | null> {
    const out = await this.callJSON(
      'You rewrite coding-education learning objectives to be encouraging and specific, without changing their factual meaning. Output {"learning_objective": string}.',
      `Rewrite this objective, keeping the same meaning: "${ctx.deterministicObjective}"`,
      LearningObjectiveSchema,
    );
    return out?.learning_objective ?? null;
  }

  async interpretAmbiguousEvidence(ctx: { skillName: string; contradictionExplanation: string; recentScores: number[] }) {
    const out = await this.callJSON(
      'You help interpret ambiguous/contradictory student evidence for a coding tutor. Output {"interpretation": string, "recommended_action": string}.',
      `Skill: ${ctx.skillName}. Contradiction detected: ${ctx.contradictionExplanation}. Recent normalized scores: ${JSON.stringify(ctx.recentScores)}.`,
      AmbiguousEvidenceInterpretationSchema,
    );
    return out ? { interpretation: out.interpretation, recommendedAction: out.recommended_action } : null;
  }

  async explainFeedback(ctx: { skillName: string; mistakeCategory: string; deterministicExplanation: string }): Promise<string | null> {
    const out = await this.callJSON(
      'You lightly polish feedback explanations for a coding tutor, keeping the same facts. Output {"explanation": string}.',
      `Skill: ${ctx.skillName}. Mistake category: ${ctx.mistakeCategory}. Deterministic explanation: "${ctx.deterministicExplanation}"`,
      FeedbackExplanationSchema,
    );
    return out?.explanation ?? null;
  }
}
