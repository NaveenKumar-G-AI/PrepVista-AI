import { z } from "zod";

// Section 61/62 of the spec: every AI output must match a strict contract,
// and malformed output must be rejected safely rather than crash the session
// (section 108). The engine only ever trusts `message` from this contract -
// action/target/help-level are always supplied BY the engine and echoed back
// for a consistency check (see ai/client.ts), never decided by the model.
export const AiOutputSchema = z.object({
  action: z.enum(["ASK", "HINT", "REPHRASE", "SIMPLIFY", "EXPLAIN", "VERIFY", "REFLECT", "COMPLETE", "ESCALATE"]),
  message: z.string().min(1).max(1000),
  targetSkill: z.string().optional(),
  targetStep: z.string().optional(),
  intent: z.string().optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  helpLevel: z.number().int().min(0).max(6).optional(),
  evidenceType: z.enum(["reasoning", "answer_only", "none"]).optional(),
  requiresVerification: z.boolean().optional(),
});

export type AiOutputContract = z.infer<typeof AiOutputSchema>;

/**
 * Parses raw model text into a validated AiOutputContract, or returns null
 * on ANY problem (not JSON, missing field, wrong enum value, fenced in
 * markdown, etc). Callers must always have a deterministic fallback ready -
 * this function never throws.
 */
export function safeParseAiOutput(raw: string): AiOutputContract | null {
  if (!raw) return null;
  const stripped = raw
    .trim()
    .replace(/^```(json)?/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return null;
  }

  const result = AiOutputSchema.safeParse(parsed);
  return result.success ? result.data : null;
}
