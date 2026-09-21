/**
 * Execution-grounded generators: Prediction, State Trace, Edge Case.
 *
 * These probes must never fabricate runtime facts. Where the caller can
 * supply real execution evidence (e.g. CodeForge's existing execution
 * sandbox ran the code on a specific input), that fact is threaded through
 * as `executionFact` on the resulting Probe and later passed into the
 * evaluation prompt as ground truth. Where no live execution is available,
 * the probe is still generated (the question itself is grounded in the
 * actual code), but the profile's confidence for that evidence item is
 * capped — see evaluateResponse() in api/controllers.ts.
 */
import { GeneratedProbeSchema } from "@/ai/schemas.js";
import { buildProbeGenerationPrompt } from "@/ai/prompts.js";
import { structuredCall, type StructuredCallOutcome } from "@/ai/structuredCall.js";
import type { ProviderChain } from "@/ai/provider.js";
import type { GeneratedProbeAI } from "@/ai/schemas.js";
import type { MentalModel, ProbeGrounding, StudentSubmission } from "@/types/index.js";
import type { ProbeSpec } from "@/understanding/probeEngine.js";

export interface GenerateProbeContentResult {
  outcome: StructuredCallOutcome<GeneratedProbeAI>;
  grounding: ProbeGrounding;
}

/** Categories considered only when relevant to the actual problem constraints,
 *  per spec: "Only generate relevant cases." */
const EDGE_CASE_CATEGORY_RULES: Array<{ category: string; appliesIf: (m: MentalModel) => boolean }> = [
  { category: "empty input", appliesIf: () => true },
  { category: "single element", appliesIf: () => true },
  { category: "duplicate values", appliesIf: (m) => !m.assumptions.some((a) => /no duplicates|distinct/i.test(a)) },
  { category: "negative values", appliesIf: (m) => !m.constraints.some((c) => /non-negative|>=\s*0|positive/i.test(c)) },
  { category: "minimum constraint boundary", appliesIf: (m) => m.constraints.length > 0 },
  { category: "maximum constraint boundary", appliesIf: (m) => m.constraints.length > 0 },
  { category: "already sorted input", appliesIf: (m) => /sort|order/i.test(m.algorithm) },
  { category: "reverse-sorted input", appliesIf: (m) => /sort|order/i.test(m.algorithm) },
];

export function relevantEdgeCaseCategories(mentalModel: MentalModel): string[] {
  const fromRules = EDGE_CASE_CATEGORY_RULES.filter((r) => r.appliesIf(mentalModel)).map((r) => r.category);
  const fromModel = mentalModel.relevant_edge_cases;
  return Array.from(new Set([...fromModel, ...fromRules])).slice(0, 8);
}

/** Shared by every generator module — the only place that actually calls the AI layer for probe text. */
export async function generateGroundedProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  const { systemPrompt, userContent } = buildProbeGenerationPrompt({
    submission,
    mentalModel,
    targetDimension: spec.dimension,
    probeType: spec.probeType,
    difficulty: spec.difficulty,
    priorEvidenceSummary,
  });

  const outcome = await structuredCall({ chain, schema: GeneratedProbeSchema, systemPrompt, userContent });

  const grounding: ProbeGrounding = {
    code_excerpt: submission.source_code.slice(0, 2000),
    input: undefined,
    execution_fact: submission.execution.ran
      ? `Passed ${submission.execution.passed_tests}/${submission.execution.total_tests} tests.`
      : undefined,
  };

  return { outcome, grounding };
}

export async function generatePredictionProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  return generateGroundedProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
}

export async function generateStateTraceProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  return generateGroundedProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
}

export async function generateEdgeCaseProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  const categories = relevantEdgeCaseCategories(mentalModel);
  const augmentedSummary = `${priorEvidenceSummary}\nRelevant edge-case categories to choose from (pick ONE, the most interesting given the code): ${categories.join(", ")}.`;
  return generateGroundedProbe(submission, mentalModel, spec, augmentedSummary, chain);
}
