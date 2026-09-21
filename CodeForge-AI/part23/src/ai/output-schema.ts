// ============================================================================
// AI output schema validation (Sections 39-40)
// ============================================================================
// The AI may propose coaching language and pick among the deterministic
// engine's own top candidates — never invent a new action name (Section 40:
// "Do not let the LLM arbitrarily invent action names. Use a controlled
// action taxonomy."). Anything that doesn't validate, or whose
// recommendedAction wasn't in the candidate set it was actually offered, is
// rejected — the caller (orchestrator.ts) falls back to the deterministic
// top pick rather than trusting it.
// ============================================================================

import { z } from "zod";
import { CoachingLevel, ConfidenceLevel, DebuggingActionType, InformationGain } from "../types.js";

export const AiCoachOutputSchema = z.object({
  recommendedAction: z.nativeEnum(DebuggingActionType),
  target: z.string().max(200).optional(),
  reason: z.string().min(1).max(500),
  expectedInformationGain: z.nativeEnum(InformationGain),
  coachingLevel: z.nativeEnum(CoachingLevel),
  question: z.string().min(1).max(600),
  confidence: z.nativeEnum(ConfidenceLevel),
});

export type AiCoachOutput = z.infer<typeof AiCoachOutputSchema>;

export interface ValidationResult {
  valid: boolean;
  data?: AiCoachOutput;
  errors?: string[];
}

/**
 * Parses and validates raw AI output text (JSON, optionally wrapped in
 * markdown fences — some providers add these despite instructions not to).
 * `allowedActions` must be exactly the candidate set the model was actually
 * offered in the prompt for this turn.
 */
export function validateAiOutput(raw: string, allowedActions: DebuggingActionType[]): ValidationResult {
  const stripped = raw
    .replace(/^\s*```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/i, "")
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch {
    return { valid: false, errors: ["Response was not valid JSON."] };
  }

  const result = AiCoachOutputSchema.safeParse(parsed);
  if (!result.success) {
    return { valid: false, errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`) };
  }

  if (!allowedActions.includes(result.data.recommendedAction)) {
    return {
      valid: false,
      errors: [
        `recommendedAction "${result.data.recommendedAction}" was not among the candidates offered (${allowedActions.join(", ")}).`,
      ],
    };
  }

  return { valid: true, data: result.data };
}
