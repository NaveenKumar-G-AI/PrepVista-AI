import OpenAI from "openai";
import { z } from "zod";
import type { DifficultyLevel } from "./types.js";

// ── AI output contract (Phase 36) ───────────────────────────────────────────
export const GeneratedQuestionSchema = z.object({
  skillId: z.string().min(1),
  difficulty: z.enum(["FOUNDATION", "BEGINNER", "INTERMEDIATE", "ADVANCED", "CHALLENGE"]),
  prompt: z.string().min(10),
  options: z.array(z.string().min(1)).min(3).max(6),
  correctOptionIndex: z.number().int(),
  explanation: z.string().min(10),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Phase 35: structural + semantic checks. AI is never the source of truth
 * for correctness — this function is. A question that fails any check is
 * rejected outright, never shown "because the AI generated it."
 */
export function validateGeneratedQuestion(raw: unknown, expectedSkillId: string): ValidationResult {
  const parsed = GeneratedQuestionSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) };
  }
  const q = parsed.data;
  const errors: string[] = [];
  if (q.skillId !== expectedSkillId) errors.push(`skillId mismatch: expected ${expectedSkillId}, got ${q.skillId}`);
  if (q.correctOptionIndex < 0 || q.correctOptionIndex >= q.options.length) errors.push("correctOptionIndex out of range");
  const dedupedOptions = new Set(q.options.map((o) => o.trim().toLowerCase()));
  if (dedupedOptions.size !== q.options.length) errors.push("duplicate options detected");
  if (q.prompt.trim().length === 0) errors.push("empty prompt");
  return { valid: errors.length === 0, errors };
}

// ── Provider interface + implementations ────────────────────────────────────
export interface AIContentProvider {
  generateExplanation(skillName: string, gap: string, detail: string): Promise<string>;
  generatePracticeQuestion(skillId: string, skillName: string, difficulty: DifficultyLevel): Promise<GeneratedQuestion>;
}

/**
 * Always available, zero external calls. This is what the demo runs on with
 * a blank GROQ_API_KEY — Phase 37 requires the system stay fully operational
 * without AI, not degrade into a broken experience.
 */
export class DeterministicFallbackProvider implements AIContentProvider {
  async generateExplanation(skillName: string, _gap: string, detail: string): Promise<string> {
    return `${skillName}: ${detail} Review the worked examples for this skill, then attempt the guided practice set.`;
  }

  async generatePracticeQuestion(skillId: string, skillName: string, difficulty: DifficultyLevel): Promise<GeneratedQuestion> {
    const template = FALLBACK_TEMPLATES[skillId];
    if (template) return { ...template, difficulty };
    return {
      skillId,
      difficulty,
      prompt: `Practice question placeholder for ${skillName} (${difficulty}). Wire this skill into src/domain/aiContent.ts's FALLBACK_TEMPLATES or enable GROQ_API_KEY.`,
      options: ["Option A", "Option B", "Option C", "Option D"],
      correctOptionIndex: 0,
      explanation: "This is a placeholder; no fallback template or AI provider produced real content for this skill.",
    };
  }
}

const FALLBACK_TEMPLATES: Record<string, Omit<GeneratedQuestion, "difficulty">> = {
  "percentage-fundamentals": {
    skillId: "percentage-fundamentals",
    prompt: "What is 15% of 240?",
    options: ["24", "36", "40", "48"],
    correctOptionIndex: 1,
    explanation: "15% of 240 = (15/100) × 240 = 36.",
  },
  "percentage-application": {
    skillId: "percentage-application",
    prompt: "A shirt's price increased from ₹800 to ₹920. What is the percentage increase?",
    options: ["10%", "12.5%", "15%", "20%"],
    correctOptionIndex: keyIndex(1), // 15%
    explanation: "Increase = 920 − 800 = 120. Percentage increase = (120 / 800) × 100 = 15%.",
  },
  "profit-loss": {
    skillId: "profit-loss",
    prompt: "An item bought for ₹500 is sold for ₹575. What is the profit percentage?",
    options: ["10%", "15%", "20%", "25%"],
    correctOptionIndex: 1,
    explanation: "Profit = 575 − 500 = 75. Profit % = (75 / 500) × 100 = 15%.",
  },
};

function keyIndex(i: number): number {
  return i;
}

/** Real adapter — Groq's API is OpenAI-compatible. Throws if no key is set; callers must catch and fall back (Phase 37). */
export class GroqContentProvider implements AIContentProvider {
  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, baseURL: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL });
    this.model = model;
  }

  async generateExplanation(skillName: string, gap: string, detail: string): Promise<string> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: "You write one short, concrete explanation (2-3 sentences) for a student prep app. No fluff, no encouragement filler.",
        },
        { role: "user", content: `Skill: ${skillName}. Gap type: ${gap}. Evidence detail: ${detail}. Write the explanation.` },
      ],
      temperature: 0.4,
      max_tokens: 200,
    });
    return completion.choices[0]?.message?.content?.trim() ?? "";
  }

  async generatePracticeQuestion(skillId: string, skillName: string, difficulty: DifficultyLevel): Promise<GeneratedQuestion> {
    const completion = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content:
            "Generate one aptitude practice question as strict JSON matching this shape and nothing else: " +
            '{"skillId": string, "difficulty": string, "prompt": string, "options": string[3..6], "correctOptionIndex": number, "explanation": string}. ' +
            "No markdown fences, no commentary.",
        },
        { role: "user", content: `skillId: ${skillId}, skillName: ${skillName}, difficulty: ${difficulty}` },
      ],
      temperature: 0.6,
      max_tokens: 400,
    });
    const text = completion.choices[0]?.message?.content?.trim() ?? "{}";
    const raw = JSON.parse(text);
    const result = validateGeneratedQuestion(raw, skillId);
    if (!result.valid) {
      throw new Error(`Generated question failed validation: ${result.errors.join("; ")}`);
    }
    return raw as GeneratedQuestion;
  }
}

/** Composed provider: tries Groq if configured, always falls back cleanly. Never throws to the caller. */
export class FallbackChainProvider implements AIContentProvider {
  constructor(private primary: AIContentProvider | null, private fallback: AIContentProvider) {}

  async generateExplanation(skillName: string, gap: string, detail: string): Promise<string> {
    if (this.primary) {
      try {
        return await this.primary.generateExplanation(skillName, gap, detail);
      } catch {
        // fall through to deterministic fallback — Phase 37
      }
    }
    return this.fallback.generateExplanation(skillName, gap, detail);
  }

  async generatePracticeQuestion(skillId: string, skillName: string, difficulty: DifficultyLevel): Promise<GeneratedQuestion> {
    if (this.primary) {
      try {
        return await this.primary.generatePracticeQuestion(skillId, skillName, difficulty);
      } catch {
        // fall through to deterministic fallback — Phase 37
      }
    }
    return this.fallback.generatePracticeQuestion(skillId, skillName, difficulty);
  }
}

export function buildAIContentProvider(env: { GROQ_API_KEY?: string; GROQ_BASE_URL?: string; GROQ_MODEL?: string }): AIContentProvider {
  const fallback = new DeterministicFallbackProvider();
  if (!env.GROQ_API_KEY) return new FallbackChainProvider(null, fallback);
  const primary = new GroqContentProvider(env.GROQ_API_KEY, env.GROQ_BASE_URL ?? "https://api.groq.com/openai/v1", env.GROQ_MODEL ?? "llama-3.3-70b-versatile");
  return new FallbackChainProvider(primary, fallback);
}
