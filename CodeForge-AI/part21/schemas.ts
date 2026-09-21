/**
 * Structured-output contracts. Every AI call in this feature must validate
 * against one of these schemas before its output is treated as data. If
 * validation fails, the caller retries with a repair prompt, then falls
 * back across providers, then finally degrades to reduced confidence rather
 * than inventing a result. See ai/structuredCall.ts.
 */
import { z } from "zod";
import { PROBE_TYPES, DIFFICULTY_LADDER, UNDERSTANDING_DIMENSIONS } from "@/types/index.js";

const dimensionEnum = z.enum(UNDERSTANDING_DIMENSIONS as unknown as [string, ...string[]]);
const probeTypeEnum = z.enum(PROBE_TYPES as unknown as [string, ...string[]]);
const difficultyEnum = z.enum(DIFFICULTY_LADDER as unknown as [string, ...string[]]);

// ---------------------------------------------------------------------------
// Mental model extraction
// ---------------------------------------------------------------------------

export const MentalModelSchema = z.object({
  problem_objective: z.string().min(1).max(500),
  constraints: z.array(z.string().max(200)).max(10),
  algorithm: z.string().min(1).max(300),
  algorithm_steps: z.array(z.string().max(300)).min(1).max(15),
  important_variables: z
    .array(
      z.object({
        name: z.string().max(60),
        meaning: z.string().max(300),
        changes_when: z.string().max(300),
      })
    )
    .max(15),
  data_structures: z.array(z.string().max(100)).max(10),
  state_transitions: z.array(z.string().max(300)).max(15),
  control_flow_summary: z.string().max(500),
  candidate_invariants: z.array(z.string().max(300)).max(8),
  correctness_argument: z.string().max(600),
  complexity: z.object({
    time: z.string().max(60),
    space: z.string().max(60),
    justification: z.string().max(400),
  }),
  tradeoffs: z.array(z.string().max(300)).max(8),
  relevant_edge_cases: z.array(z.string().max(150)).max(12),
  assumptions: z.array(z.string().max(300)).max(8),
});
export type MentalModelAI = z.infer<typeof MentalModelSchema>;

// ---------------------------------------------------------------------------
// Probe generation
// ---------------------------------------------------------------------------

export const GeneratedProbeSchema = z.object({
  target_dimension: dimensionEnum,
  target_concept: z.string().min(1).max(150),
  probe_type: probeTypeEnum,
  difficulty: difficultyEnum,
  purpose: z.string().min(1).max(300),
  question: z.string().min(1).max(600),
  expected_reasoning: z.string().min(1).max(400),
  evaluation_criteria: z.array(z.string().max(200)).min(1).max(6),
  expected_evidence: z.string().min(1).max(500),
});
export type GeneratedProbeAI = z.infer<typeof GeneratedProbeSchema>;

// ---------------------------------------------------------------------------
// Code mutation (for debugging probes)
// ---------------------------------------------------------------------------

export const CodeMutationSchema = z.object({
  mutated_code: z.string().min(1).max(8000),
  mutation_description: z.string().min(1).max(200),
  mutation_kind: z.enum([
    "remove_state_update",
    "change_comparison",
    "alter_loop_boundary",
    "change_initialization",
    "remove_validation",
    "change_data_structure_operation",
  ]),
  changed_line_hint: z.string().max(200).optional(),
});
export type CodeMutationAI = z.infer<typeof CodeMutationSchema>;

// ---------------------------------------------------------------------------
// Response evaluation (the core grading call)
// ---------------------------------------------------------------------------

export const ResponseEvaluationSchema = z.object({
  observed_evidence: z.string().min(1).max(500),
  result: z.enum(["correct", "partially_correct", "incorrect", "ambiguous", "no_response"]),
  confidence: z.number().min(0).max(100),
  reasoning: z.string().min(1).max(400),
  /** Set true only when the response is too ambiguous to score and warrants a clarifying follow-up. */
  needs_clarification: z.boolean(),
  /** Short, specific gap description if result is not "correct". Empty string if not applicable. */
  gap_if_any: z.string().max(300),
});
export type ResponseEvaluationAI = z.infer<typeof ResponseEvaluationSchema>;

// ---------------------------------------------------------------------------
// Recommendation generation (fallback when no template matches a gap)
// ---------------------------------------------------------------------------

export const RecommendationSchema = z.object({
  recommendation: z.string().min(1).max(300),
});
export type RecommendationAI = z.infer<typeof RecommendationSchema>;
