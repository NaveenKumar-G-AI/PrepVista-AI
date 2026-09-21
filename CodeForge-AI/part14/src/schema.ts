import { z } from "zod";

// The model must return exactly this shape — nothing more (.strict()),
// nothing less. Malformed or extended output is rejected by
// engine/coachEngine.ts, never rendered to the student.

export const CodeLocationSchema = z
  .object({
    file: z.string().max(300).optional(),
    line: z.number().int().positive().optional(),
    endLine: z.number().int().positive().optional(),
    function: z.string().max(200).optional(),
  })
  .strict();

export const CoachResponseSchema = z
  .object({
    response_type: z.enum([
      "OBSERVATION",
      "QUESTION",
      "HINT",
      "EXPLANATION",
      "REFLECTION",
      "CLARIFICATION",
      "SOLUTION_ASSISTANCE",
    ]),
    observation: z.string().min(1).max(1200),
    concept: z.string().max(200).optional(),
    code_locations: z.array(CodeLocationSchema).max(5).default([]),
    confidence: z.enum(["HIGH", "MEDIUM", "LOW"]),
    coaching_level: z.number().int().min(1).max(5),
    next_question: z.string().max(400).optional(),
    student_action: z.string().max(400).optional(),
    solution_reveal: z.boolean(),
  })
  .strict();

export type CoachResponse = z.infer<typeof CoachResponseSchema>;
