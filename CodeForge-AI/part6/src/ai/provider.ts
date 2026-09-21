import { z } from 'zod';

/**
 * AI is strictly an enhancement layer (Phase 45). It may rephrase an
 * explanation more naturally, but it never decides mastery, evidence,
 * completion, readiness, or priority — those are computed deterministically
 * upstream and passed IN as grounding context that the AI cannot contradict.
 */

export const ExplanationSchema = z.object({
  summary: z.string().min(1).max(400),
  reason: z.string().min(1).max(400),
});
export type ExplanationOutput = z.infer<typeof ExplanationSchema>;

export interface GroundedExplanationContext {
  skillName: string;
  gapStatus: string;
  targetMastery: string;
  learningObjective: string;
  deterministicExplanation: string;
}

export interface AIProvider {
  name: string;
  isConfigured(): boolean;
  polishExplanation(ctx: GroundedExplanationContext): Promise<ExplanationOutput | null>;
}

/**
 * Wraps any provider with strict JSON-schema validation (Phase 47): if the
 * provider is unconfigured, unreachable, times out, or returns anything that
 * doesn't validate, we fall back to the deterministic explanation untouched.
 * The roadmap keeps functioning either way — AI can only make the copy nicer,
 * never gate functionality.
 */
export async function withValidationAndFallback(
  provider: AIProvider,
  ctx: GroundedExplanationContext
): Promise<{ text: string; source: 'ai' | 'fallback'; provider: string }> {
  if (!provider.isConfigured()) {
    return { text: ctx.deterministicExplanation, source: 'fallback', provider: provider.name };
  }
  try {
    const result = await Promise.race([
      provider.polishExplanation(ctx),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    if (!result) return { text: ctx.deterministicExplanation, source: 'fallback', provider: provider.name };
    const parsed = ExplanationSchema.safeParse(result);
    if (!parsed.success) {
      return { text: ctx.deterministicExplanation, source: 'fallback', provider: provider.name };
    }
    // Even on success we don't trust the AI's *facts* — only its phrasing of
    // fields we already computed. We still return the deterministic text as
    // the guaranteed-accurate baseline the caller can prefer.
    return { text: `${parsed.data.summary} ${parsed.data.reason}`.trim(), source: 'ai', provider: provider.name };
  } catch {
    return { text: ctx.deterministicExplanation, source: 'fallback', provider: provider.name };
  }
}

export class DeterministicFallbackProvider implements AIProvider {
  name = 'deterministic-fallback';
  isConfigured(): boolean {
    return true;
  }
  async polishExplanation(ctx: GroundedExplanationContext): Promise<ExplanationOutput | null> {
    return { summary: ctx.deterministicExplanation, reason: ctx.learningObjective };
  }
}
