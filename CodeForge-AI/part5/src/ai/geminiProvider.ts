import { config } from '../config/index.js';
import type { AIProvider } from './types.js';
import { LearningObjectiveSchema, AmbiguousEvidenceInterpretationSchema, FeedbackExplanationSchema } from './schemas.js';

/**
 * Talks to Gemini's generateContent REST endpoint. Requires GEMINI_API_KEY.
 * Same sandbox network caveat as GroqProvider — see that file's comment and
 * CODEFORGE_FINAL_REPORT.md.
 */
export class GeminiProvider implements AIProvider {
  readonly name = 'gemini';
  private apiKey = process.env.GEMINI_API_KEY ?? '';

  private async callJSON<T>(prompt: string, schema: { safeParse: (v: unknown) => { success: boolean; data?: T } }): Promise<T | null> {
    if (!this.apiKey) return null;
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${config.ai.geminiModel}:generateContent?key=${this.apiKey}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.ai.timeoutMs);
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: `${prompt}\n\nRespond with ONLY a JSON object, no markdown fences, no preamble.` }] }],
          generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
        }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      const result = schema.safeParse(parsed);
      return result.success ? (result.data as T) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async generateLearningObjective(ctx: { deterministicObjective: string }): Promise<string | null> {
    const out = await this.callJSON(
      `Rewrite this coding-education learning objective to be encouraging and specific, without changing its factual meaning. Output {"learning_objective": string}. Objective: "${ctx.deterministicObjective}"`,
      LearningObjectiveSchema,
    );
    return out?.learning_objective ?? null;
  }

  async interpretAmbiguousEvidence(ctx: { skillName: string; contradictionExplanation: string; recentScores: number[] }) {
    const out = await this.callJSON(
      `Interpret ambiguous/contradictory student evidence for a coding tutor. Output {"interpretation": string, "recommended_action": string}. Skill: ${ctx.skillName}. Contradiction: ${ctx.contradictionExplanation}. Recent scores: ${JSON.stringify(ctx.recentScores)}`,
      AmbiguousEvidenceInterpretationSchema,
    );
    return out ? { interpretation: out.interpretation, recommendedAction: out.recommended_action } : null;
  }

  async explainFeedback(ctx: { skillName: string; mistakeCategory: string; deterministicExplanation: string }): Promise<string | null> {
    const out = await this.callJSON(
      `Lightly polish this feedback explanation, keeping the same facts. Output {"explanation": string}. Skill: ${ctx.skillName}. Mistake: ${ctx.mistakeCategory}. Explanation: "${ctx.deterministicExplanation}"`,
      FeedbackExplanationSchema,
    );
    return out?.explanation ?? null;
  }
}
