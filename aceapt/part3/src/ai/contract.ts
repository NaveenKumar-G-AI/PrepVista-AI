import { z } from 'zod';

// Phase 20's contract, enforced. Anything that doesn't parse against this
// never reaches a student — see ai/narrative.ts.
export const AIFindingSchema = z.object({
  findingType: z.enum(['hidden_strength', 'overconfidence_flag', 'prerequisite_dependency', 'recommended_focus', 'general']),
  skillId: z.string().min(1),
  evidenceIds: z.array(z.string()),
  interpretation: z.string().min(1).max(500),
  confidence: z.number().min(0).max(1),
  recommendedFocus: z.boolean(),
  studentMessage: z.string().min(1).max(400),
});

export type AIFinding = z.infer<typeof AIFindingSchema>;
