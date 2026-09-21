import { z } from 'zod';

// ---------------------------------------------------------------------------
// AI is used for exactly one thing in this engine: turning already-computed,
// already-deterministic results into readable narrative text for the
// student report (section 26). It NEVER decides performance_level,
// evidence_level, readiness_state, or readiness_confidence — those are
// fully computed before any AI call happens and are passed in as fixed,
// read-only input. If every provider is unavailable, NullProvider produces
// a template-based summary from the same structured data, so the pipeline
// never blocks on AI (sections 27, 65, 87).
// ---------------------------------------------------------------------------

export interface QualitativeSummaryInput {
  studentName: string;
  targetRole: string;
  readinessState: string;
  readinessConfidence: string;
  skillResults: { skill_name: string; performance_level: string; evidence_level: string }[];
}

const QualitativeSummarySchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()),
  development_areas: z.array(z.string()),
  reason: z.string().min(1),
  // The AI's own self-rated confidence in its NARRATIVE framing — cosmetic
  // only. Do not confuse with assessment_readiness_results.readiness_confidence,
  // which is computed deterministically in readinessService.ts before this
  // is ever called.
  confidence: z.enum(['low', 'medium', 'high']),
});
export type QualitativeSummaryOutput = z.infer<typeof QualitativeSummarySchema>;

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  generateQualitativeSummary(input: QualitativeSummaryInput): Promise<QualitativeSummaryOutput>;
}

function buildPrompt(input: QualitativeSummaryInput): string {
  return [
    'You are summarizing an ALREADY-COMPUTED coding-readiness assessment result.',
    'Do not invent scores, test results, or a different readiness state — only explain the ones given.',
    `Student: ${input.studentName}`,
    `Target role: ${input.targetRole}`,
    `Readiness: ${input.readinessState} (confidence: ${input.readinessConfidence})`,
    'Per-skill results:',
    ...input.skillResults.map(
      (r) => `- ${r.skill_name}: ${r.performance_level} (evidence: ${r.evidence_level})`
    ),
    '',
    'Respond with ONLY a JSON object, no markdown fences, matching exactly:',
    '{"summary": string, "strengths": string[], "development_areas": string[], "reason": string, "confidence": "low"|"medium"|"high"}',
  ].join('\n');
}

function extractJson(text: string): unknown {
  const cleaned = text.replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await promise;
  } finally {
    clearTimeout(timer);
  }
}

async function validateWithRetry(
  call: () => Promise<string>,
  attempts = 2
): Promise<QualitativeSummaryOutput> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      const raw = await call();
      const json = extractJson(raw);
      return QualitativeSummarySchema.parse(json); // REJECT malformed output (section 28) — no silent accept
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('AI output validation failed');
}

export class GroqProvider implements AIProvider {
  name = 'groq';
  isConfigured(): boolean {
    const key = process.env.GROQ_API_KEY;
    return !!key && !key.startsWith('REPLACE_WITH');
  }

  async generateQualitativeSummary(input: QualitativeSummaryInput): Promise<QualitativeSummaryOutput> {
    return validateWithRetry(async () => {
      const res = await withTimeout(
        fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
          },
          body: JSON.stringify({
            model: process.env.GROQ_MODEL || 'llama-3.3-70b-versatile',
            messages: [{ role: 'user', content: buildPrompt(input) }],
            temperature: 0.3,
            response_format: { type: 'json_object' },
          }),
        }),
        10_000
      );
      if (!res.ok) throw new Error(`Groq HTTP ${res.status}`);
      const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return data.choices?.[0]?.message?.content ?? '';
    });
  }
}

export class GeminiProvider implements AIProvider {
  name = 'gemini';
  isConfigured(): boolean {
    const key = process.env.GEMINI_API_KEY;
    return !!key && !key.startsWith('REPLACE_WITH');
  }

  async generateQualitativeSummary(input: QualitativeSummaryInput): Promise<QualitativeSummaryOutput> {
    return validateWithRetry(async () => {
      const model = process.env.GEMINI_MODEL || 'gemini-2.0-flash';
      const res = await withTimeout(
        fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: buildPrompt(input) }] }],
              generationConfig: { temperature: 0.3, responseMimeType: 'application/json' },
            }),
          }
        ),
        10_000
      );
      if (!res.ok) throw new Error(`Gemini HTTP ${res.status}`);
      const data = (await res.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      return data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
    });
  }
}

/** Deterministic, template-based fallback — no network call, always succeeds. */
export class NullProvider implements AIProvider {
  name = 'none';
  isConfigured(): boolean {
    return true;
  }
  async generateQualitativeSummary(input: QualitativeSummaryInput): Promise<QualitativeSummaryOutput> {
    const strengths = input.skillResults.filter((r) => ['strong', 'competent'].includes(r.performance_level));
    const gaps = input.skillResults.filter((r) => ['weak', 'developing'].includes(r.performance_level));
    const unknowns = input.skillResults.filter((r) => r.evidence_level === 'insufficient_evidence');
    return {
      summary: `${input.studentName} is currently ${input.readinessState.replace(/_/g, ' ')} for ${input.targetRole} (confidence: ${input.readinessConfidence}).`,
      strengths: strengths.map((s) => `${s.skill_name}: ${s.performance_level}`),
      development_areas: gaps.map((g) => `${g.skill_name}: ${g.performance_level}`),
      reason:
        unknowns.length > 0
          ? `Based on gated competencies with recorded evidence; ${unknowns.map((u) => u.skill_name).join(', ')} still has insufficient evidence and was not counted for or against readiness.`
          : 'Based on gated competencies with recorded evidence.',
      confidence: 'medium',
    };
  }
}

/** Tries providers in AI_PROVIDER_ORDER, falls back to NullProvider on any failure or if none are configured (sections 27, 65, 87). */
export class AIProviderRouter {
  private providers: AIProvider[];
  private fallback = new NullProvider();

  constructor(providers: AIProvider[]) {
    this.providers = providers;
  }

  async generateQualitativeSummary(input: QualitativeSummaryInput): Promise<{ output: QualitativeSummaryOutput; providerUsed: string }> {
    for (const provider of this.providers) {
      if (!provider.isConfigured()) continue;
      try {
        const output = await provider.generateQualitativeSummary(input);
        return { output, providerUsed: provider.name };
      } catch {
        continue; // graceful degradation to the next provider (section 28)
      }
    }
    const output = await this.fallback.generateQualitativeSummary(input);
    return { output, providerUsed: this.fallback.name };
  }
}

function defaultOrder(): AIProvider[] {
  const order = (process.env.AI_PROVIDER_ORDER || 'groq,gemini').split(',').map((s) => s.trim());
  const registry: Record<string, AIProvider> = { groq: new GroqProvider(), gemini: new GeminiProvider() };
  return order.map((name) => registry[name]).filter(Boolean);
}

export const aiRouter = new AIProviderRouter(defaultOrder());
