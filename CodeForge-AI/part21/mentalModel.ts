/**
 * Mental Model Extraction.
 *
 * "Do not make an LLM rediscover information that deterministic analysis
 * already provides." Concretely: if `submission.existingAnalysis` already
 * has complexity/quality/reasoning-consistency data from CodeForge's own
 * analyzers, that data is passed into the prompt as GROUND TRUTH and the
 * model is instructed to build on it rather than re-derive it, and we
 * overwrite whatever the model returns for those fields with the
 * deterministic values after the call — the AI's job is to fill in the
 * *conceptual* fields (algorithm steps, invariants, variable meanings)
 * that no deterministic analyzer produces.
 */
import { MentalModelSchema } from "@/ai/schemas.js";
import { buildMentalModelPrompt } from "@/ai/prompts.js";
import { structuredCall, type StructuredCallOutcome } from "@/ai/structuredCall.js";
import type { ProviderChain } from "@/ai/provider.js";
import type { MentalModel, StudentSubmission } from "@/types/index.js";

export interface ExtractMentalModelResult {
  mentalModel: MentalModel | null;
  outcome: StructuredCallOutcome<unknown>;
}

export async function extractMentalModel(
  submission: StudentSubmission,
  chain: ProviderChain,
  onProviderFailure?: (provider: string, error: unknown) => void
): Promise<ExtractMentalModelResult> {
  const { systemPrompt, userContent } = buildMentalModelPrompt(submission);

  const outcome = await structuredCall({
    chain,
    schema: MentalModelSchema,
    systemPrompt,
    userContent,
    onProviderFailure,
  });

  if (!outcome.ok) {
    return { mentalModel: null, outcome };
  }

  const ai = outcome.data;
  const existing = submission.existingAnalysis;

  const mentalModel: MentalModel = {
    problem_objective: ai.problem_objective,
    constraints: ai.constraints,
    algorithm: ai.algorithm,
    algorithm_steps: ai.algorithm_steps,
    important_variables: ai.important_variables,
    data_structures: ai.data_structures,
    state_transitions: ai.state_transitions,
    control_flow_summary: ai.control_flow_summary,
    candidate_invariants: ai.candidate_invariants,
    correctness_argument: ai.correctness_argument,
    // Deterministic values win when present — never let the model override known facts.
    complexity: existing?.complexity
      ? {
          time: existing.complexity.time,
          space: existing.complexity.space,
          justification: ai.complexity.justification,
        }
      : ai.complexity,
    tradeoffs: ai.tradeoffs,
    relevant_edge_cases: ai.relevant_edge_cases,
    assumptions: ai.assumptions,
    derivedFromExistingAnalysis: Boolean(existing?.complexity),
  };

  return { mentalModel, outcome };
}
