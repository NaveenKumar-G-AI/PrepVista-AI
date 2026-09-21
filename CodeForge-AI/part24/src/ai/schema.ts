import { z } from 'zod';

/**
 * Every AI-generated finding is schema-validated AND cross-checked against
 * the evidence bundle that was actually sent to the model. A finding whose
 * evidence_refs point at ids that don't exist in that bundle is dropped —
 * this is the concrete mechanism behind "AI must not fabricate evidence":
 * it isn't a prompt instruction the model could ignore, it's a hard filter
 * applied after the fact, in code the model never sees or controls.
 */

const AICategory = z.enum([
  'CORRECTNESS', 'LOGIC', 'REGRESSION', 'EDGE_CASE', 'PERFORMANCE', 'COMPLEXITY', 'MEMORY',
  'READABILITY', 'MAINTAINABILITY', 'DUPLICATION', 'ERROR_HANDLING', 'RESOURCE_MANAGEMENT',
  'ARCHITECTURE', 'API_BEHAVIOR', 'TEST_COVERAGE', 'SECURITY', 'NAMING', 'DESIGN', 'COMPATIBILITY', 'DOCUMENTATION',
]);

export const AIFindingSchema = z.object({
  category: AICategory,
  severity: z.enum(['BLOCKER', 'HIGH', 'MEDIUM', 'LOW', 'INFO']),
  priority: z.enum(['MUST_FIX', 'SHOULD_FIX', 'CONSIDER', 'OPTIONAL']),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW']),
  title: z.string().min(1).max(140),
  description: z.string().min(1).max(2000),
  why_it_matters: z.string().min(1).max(1000),
  evidence_refs: z.array(z.string()).min(1),
});

export const AIReviewOutputSchema = z.object({
  findings: z.array(AIFindingSchema).max(20),
});

export type AIFinding = z.infer<typeof AIFindingSchema>;

export interface AIValidationResult {
  findings: AIFinding[];
  rejectedCount: number;
  parseFailed: boolean;
}

export function parseAndValidateAIOutput(raw: string, knownEvidenceIds: Set<string>): AIValidationResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripCodeFences(raw));
  } catch {
    return { findings: [], rejectedCount: 0, parseFailed: true };
  }

  const result = AIReviewOutputSchema.safeParse(parsed);
  if (!result.success) {
    return { findings: [], rejectedCount: 0, parseFailed: true };
  }

  const accepted: AIFinding[] = [];
  let rejected = 0;
  for (const f of result.data.findings) {
    const allRefsKnown = f.evidence_refs.every((ref) => knownEvidenceIds.has(ref));
    if (allRefsKnown) accepted.push(f);
    else rejected++;
  }

  return { findings: accepted, rejectedCount: rejected, parseFailed: false };
}

function stripCodeFences(s: string): string {
  return s.trim().replace(/^```(json)?/i, '').replace(/```$/, '').trim();
}
