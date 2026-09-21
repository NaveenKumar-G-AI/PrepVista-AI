import { z } from 'zod';

/**
 * The AI output contract from Section 62, enforced with zod. Anything that
 * fails this schema is treated exactly like an AI outage (Section 110:
 * "AI produces invalid output -> reject, fallback, do not crash").
 *
 * Notice what is NOT in this schema: nothing here can authenticate a user,
 * authorize an action, mark a step correct, or mutate the database
 * directly. The service layer only ever reads `message` (display text) and
 * `targetIssue` (a classification label) off a validated object - it never
 * evals, execs, or otherwise treats AI output as instructions (Section 63,
 * Section 65).
 */
export const AiGuidanceOutputSchema = z.object({
  action: z.enum(['GUIDE_STEP', 'EXPLAIN_STEP', 'GIVE_HINT', 'CLASSIFY_ASSISTANCE_NEED']),
  stepId: z.string().min(1).max(200),
  message: z.string().min(1).max(800),
  helpLevel: z.number().int().min(0).max(7),
  targetSkill: z.string().max(200).optional(),
  targetIssue: z
    .enum(['CONCEPT', 'STRATEGY', 'FORMULA', 'CALCULATION', 'INTERPRETATION', 'UNIT', 'LOGIC', 'VERIFICATION'])
    .optional(),
});

export type AiGuidanceOutput = z.infer<typeof AiGuidanceOutputSchema>;

/**
 * Parses and validates raw model output. Returns null (never throws) on any
 * failure so callers have one simple contract: null means "fall back."
 */
export function parseAiGuidanceOutput(raw: string): AiGuidanceOutput | null {
  try {
    const cleaned = raw.replace(/```json/gi, '').replace(/```/g, '').trim();
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd < jsonStart) return null;
    const candidate = cleaned.slice(jsonStart, jsonEnd + 1);
    const parsed = JSON.parse(candidate);
    const result = AiGuidanceOutputSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}
