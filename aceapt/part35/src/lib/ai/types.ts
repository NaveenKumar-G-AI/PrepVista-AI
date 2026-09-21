import { z } from 'zod';

// The AI is only ever allowed to return prose grounded in facts we already
// established deterministically — never a new fact, category, or number.
export const aiNarrativeSchema = z.object({
  outcome_summary: z.string().nullable(),
  pattern_explanation: z.string().nullable(),
  recovery_rationale: z.string().nullable(),
});
export type AINarrativeRaw = z.infer<typeof aiNarrativeSchema>;

export const FAILURE_CATEGORY_CODES = [
  'TARGET_MISMATCH',
  'APPLICATION_MISMATCH',
  'ELIGIBILITY_MISMATCH',
  'TECHNICAL_PERFORMANCE',
  'COMMUNICATION_PERFORMANCE',
  'BEHAVIORAL_INTERVIEW',
  'PROJECT_EXPERIENCE_EVIDENCE',
  'INTERVIEW_PERFORMANCE',
  'ROLE_SPECIFIC_KNOWLEDGE',
  'PREPARATION_GAP',
  'OPPORTUNITY_FIT',
  'EXTERNAL_UNKNOWN',
] as const;

export const classificationSchema = z.object({
  category: z.enum(FAILURE_CATEGORY_CODES).nullable(),
});
export type ClassificationRaw = z.infer<typeof classificationSchema>;
