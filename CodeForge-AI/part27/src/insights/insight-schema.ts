import { z } from 'zod';

/** Matches section 47's required AI-output shape exactly. */
export const growthInsightOutputSchema = z
  .object({
    type: z.literal('growth_insight'),
    title: z.string().min(1).max(140),
    summary: z.string().min(1).max(800),
    evidence_refs: z.array(z.string()).max(50),
    confidence: z.enum(['LOW', 'MODERATE', 'HIGH']),
    time_window: z.object({ label: z.string(), start: z.string(), end: z.string() }),
    skills: z.array(z.string()).max(20),
  })
  .strict();

export type GrowthInsightOutput = z.infer<typeof growthInsightOutputSchema>;

export interface InsightValidationOptions {
  allowedEvidenceIds: Set<string>;
  allowedSkillIds: Set<string>;
}

export interface InsightValidationResult {
  valid: boolean;
  errors: string[];
  data: GrowthInsightOutput | null;
}

/**
 * AI Hallucination Defense (section 82). Schema validity alone is not
 * enough — a well-formed JSON object can still invent an evidence id or a
 * skill that was never supplied. This function is the check that catches
 * that: every evidence_refs and skills entry must appear in the allow-list
 * built from what was actually sent to the model, or the whole insight is
 * rejected (the caller then falls back to a deterministic summary — see
 * src/insights/insight-engine.ts — an AI insight is never allowed to
 * partially "fix itself" by dropping the bad reference and keeping the
 * rest, since the surrounding prose was written to justify the invented
 * fact too).
 */
export function validateInsightOutput(raw: unknown, options: InsightValidationOptions): InsightValidationResult {
  const parsed = growthInsightOutputSchema.safeParse(raw);
  if (!parsed.success) {
    return { valid: false, errors: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`), data: null };
  }

  const errors: string[] = [];
  for (const ref of parsed.data.evidence_refs) {
    if (!options.allowedEvidenceIds.has(ref)) errors.push(`evidence_refs references unknown evidence id: ${ref}`);
  }
  for (const skillId of parsed.data.skills) {
    if (!options.allowedSkillIds.has(skillId)) errors.push(`skills references unknown skill id: ${skillId}`);
  }
  if (parsed.data.evidence_refs.length === 0) {
    errors.push('summary has zero evidence_refs — every insight must cite at least one evidence record');
  }

  return { valid: errors.length === 0, errors, data: errors.length === 0 ? parsed.data : null };
}
