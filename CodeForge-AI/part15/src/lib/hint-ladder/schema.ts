/**
 * Structured AI output schema + parsing.
 *
 * The model is ALWAYS asked to return exactly this shape. Nothing from
 * this object reaches the student until output-guard.ts has also checked
 * it against the policy decision that authorized the call in the first
 * place (see service.ts) — schema validity alone is necessary but not
 * sufficient.
 */

import { z } from "zod";
import { ASSISTANCE_LEVELS, CONFIDENCE_LEVELS, HINT_TYPES, TEACHING_CONCEPTS } from "./types";

export const ModelHintResponseSchema = z.object({
  assistance_level: z.enum(ASSISTANCE_LEVELS as unknown as [string, ...string[]]),
  hint_type: z.enum(HINT_TYPES as unknown as [string, ...string[]]),
  concept: z.enum(TEACHING_CONCEPTS as unknown as [string, ...string[]]),
  observation: z.string().min(1).max(500),
  hint: z.string().min(1).max(900),
  target_area: z.string().max(200).nullable(),
  confidence: z.enum(CONFIDENCE_LEVELS as unknown as [string, ...string[]]),
  teaching_objective: z.string().min(1).max(300),
  next_action: z.string().max(200),
  solution_revealed: z.boolean(),
});

export type ModelHintResponse = z.infer<typeof ModelHintResponseSchema>;

export interface ParseResult {
  ok: boolean;
  data: ModelHintResponse | null;
  errors: string[];
}

/**
 * Parses raw provider output. Tolerates the common "wrapped the JSON in a
 * markdown code fence" failure mode before falling back to strict
 * rejection — providers that don't support enforced JSON schema (see
 * providers/*.ts) sometimes still do this even in JSON mode.
 */
export function parseModelOutput(raw: string): ParseResult {
  const stripped = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(stripped);
  } catch {
    return { ok: false, data: null, errors: ["Response was not valid JSON."] };
  }

  const result = ModelHintResponseSchema.safeParse(parsedJson);
  if (!result.success) {
    return {
      ok: false,
      data: null,
      errors: result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }
  return { ok: true, data: result.data, errors: [] };
}

/** JSON Schema mirror used for providers that support schema-enforced output (see providers/groq-provider.ts). */
export const MODEL_HINT_JSON_SCHEMA = {
  type: "object",
  properties: {
    assistance_level: { type: "string", enum: ASSISTANCE_LEVELS },
    hint_type: { type: "string", enum: HINT_TYPES },
    concept: { type: "string", enum: TEACHING_CONCEPTS },
    observation: { type: "string" },
    hint: { type: "string" },
    target_area: { type: ["string", "null"] },
    confidence: { type: "string", enum: CONFIDENCE_LEVELS },
    teaching_objective: { type: "string" },
    next_action: { type: "string" },
    solution_revealed: { type: "boolean" },
  },
  required: [
    "assistance_level",
    "hint_type",
    "concept",
    "observation",
    "hint",
    "target_area",
    "confidence",
    "teaching_objective",
    "next_action",
    "solution_revealed",
  ],
  additionalProperties: false,
} as const;
