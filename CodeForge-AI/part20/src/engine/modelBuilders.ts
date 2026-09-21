import { z } from "zod";
import { CONSISTENCY_DIMENSIONS } from "../types";
import type { ConsistencyDimension, ImplementationModel, RawReasoningClaim, StudentReasoningModel } from "../types";
import type { AIProvider } from "../ai/provider";
import { buildClaimDimensionClassificationPrompt } from "../ai/promptTemplates";

export function emptyClaimsByDimension(): Record<ConsistencyDimension, RawReasoningClaim[]> {
  const out = {} as Record<ConsistencyDimension, RawReasoningClaim[]>;
  for (const d of CONSISTENCY_DIMENSIONS) out[d] = [];
  return out;
}

/** Deterministic fallback classifier — used when a claim has no dimensionHint and no AI provider is configured (or AI fails). */
function keywordFallbackDimension(text: string): ConsistencyDimension {
  const t = text.toLowerCase();
  if (/o\(|complexity|big[- ]?o|time complexity/.test(t)) return "COMPLEXITY_ALIGNMENT";
  if (/space|memory|auxiliary/.test(t)) return "SPACE_ALIGNMENT";
  if (/edge case|empty input|\bnull\b|boundary/.test(t)) return "EDGE_CASE_ALIGNMENT";
  if (/\bset\b|\bmap\b|dict|stack|queue|heap|hash/.test(t)) return "DATA_STRUCTURE_ALIGNMENT";
  if (/loop|recursion|branch|iterate|condition/.test(t)) return "CONTROL_FLOW_ALIGNMENT";
  if (/invariant|pointer|\bleft\b|\bright\b|\bstate\b/.test(t)) return "STATE_ALIGNMENT";
  if (/correct|works because|proof|guarantee/.test(t)) return "CORRECTNESS_ALIGNMENT";
  if (/optimi[sz]e/.test(t)) return "OPTIMIZATION_ALIGNMENT";
  if (/because i (used|chose|need|decided)/.test(t)) return "IMPLEMENTATION_DECISION_ALIGNMENT";
  if (/problem (says|asks|requires)|requirement/.test(t)) return "PROBLEM_ALIGNMENT";
  return "ALGORITHM_ALIGNMENT";
}

const DimensionSchema = z.object({
  dimension: z.enum(CONSISTENCY_DIMENSIONS as unknown as [string, ...string[]]),
});

export async function classifyClaimDimension(claimText: string, aiProvider: AIProvider): Promise<ConsistencyDimension> {
  const fallback = keywordFallbackDimension(claimText);
  if (!aiProvider.configured) return fallback;
  const { system, user } = buildClaimDimensionClassificationPrompt({ claimText, dimensions: CONSISTENCY_DIMENSIONS });
  const result = await aiProvider.completeStructured({ system, user, schema: DimensionSchema, maxTokens: 50 });
  if (result.ok) return result.data.dimension as ConsistencyDimension;
  return fallback;
}

export async function buildStudentReasoningModel(rawClaims: RawReasoningClaim[], aiProvider: AIProvider): Promise<StudentReasoningModel> {
  const claimsByDimension = emptyClaimsByDimension();
  for (const claim of rawClaims) {
    const dim = claim.dimensionHint ?? (await classifyClaimDimension(claim.text, aiProvider));
    claimsByDimension[dim].push(claim);
  }

  // Time and space claims may come from different RawReasoningClaims (e.g. one
  // sentence about time, another about space) — read each independently
  // rather than taking both fields from whichever claim happens to be first.
  const timeClaim = rawClaims.find((c) => c.structuredHint?.complexityTime);
  const spaceClaim = rawClaims.find((c) => c.structuredHint?.complexitySpace);
  const complexityClaim =
    timeClaim || spaceClaim
      ? { time: timeClaim?.structuredHint?.complexityTime, space: spaceClaim?.structuredHint?.complexitySpace }
      : undefined;

  const variableClaims = rawClaims
    .filter((c) => c.structuredHint?.variable)
    .map((c) => ({ variable: c.structuredHint!.variable!, claimedRole: c.text }));

  const edgeCasePredictions = rawClaims
    .filter((c) => c.structuredHint?.edgeCase)
    .map((c) => ({ case: c.structuredHint!.edgeCase!, studentPrediction: c.text }));

  const dataStructureClaims = rawClaims
    .filter((c) => c.structuredHint?.dataStructureType)
    .map((c) => ({ structureType: c.structuredHint!.dataStructureType!, description: c.text }));

  const algorithmClaimText = claimsByDimension.ALGORITHM_ALIGNMENT.map((c) => c.text).join(" ");

  return { rawClaims, claimsByDimension, complexityClaim, variableClaims, edgeCasePredictions, dataStructureClaims, algorithmClaimText };
}

export function buildImplementationModel(input: {
  detectedPatternSignals?: string[];
  dataStructures?: ImplementationModel["dataStructures"];
  trustedComplexity?: ImplementationModel["trustedComplexity"];
  variableFacts?: ImplementationModel["variableFacts"];
  edgeCaseOutcomes?: ImplementationModel["edgeCaseOutcomes"];
  executionSummary?: ImplementationModel["executionSummary"];
}): ImplementationModel {
  return {
    detectedPatternSignals: input.detectedPatternSignals ?? [],
    dataStructures: input.dataStructures ?? [],
    trustedComplexity: input.trustedComplexity,
    variableFacts: input.variableFacts ?? [],
    edgeCaseOutcomes: input.edgeCaseOutcomes ?? [],
    executionSummary: input.executionSummary,
  };
}
