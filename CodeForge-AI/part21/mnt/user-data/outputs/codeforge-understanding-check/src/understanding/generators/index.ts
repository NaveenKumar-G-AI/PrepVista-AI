/**
 * Single dispatch point: given a ProbeSpec's probeType, call the right
 * generator. Controllers only need to know about this one function.
 */
import type { ProviderChain } from "@/ai/provider.js";
import type { MentalModel, StudentSubmission } from "@/types/index.js";
import type { ProbeSpec } from "@/understanding/probeEngine.js";
import type { GenerateProbeContentResult } from "./executionProbes.js";
import { generateEdgeCaseProbe, generatePredictionProbe, generateStateTraceProbe } from "./executionProbes.js";
import { generateCausalWhyProbe, generateComplexityProbe, generateExplanationProbe, generateInvariantProbe } from "./reasoningProbes.js";
import {
  generateAlternativeApproachProbe,
  generateCounterfactualProbe,
  generateDebuggingProbe,
  generateModificationProbe,
  generateTransferProbe,
} from "./transformationProbes.js";

export * from "./executionProbes.js";
export * from "./reasoningProbes.js";
export * from "./transformationProbes.js";

export async function dispatchProbeGeneration(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain,
  debuggingAttemptIndex = 0
): Promise<GenerateProbeContentResult> {
  switch (spec.probeType) {
    case "explanation":
      return generateExplanationProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "causal_why":
      return generateCausalWhyProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "invariant":
      return generateInvariantProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "complexity":
      return generateComplexityProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "prediction":
      return generatePredictionProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "state_trace":
      return generateStateTraceProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "edge_case":
      return generateEdgeCaseProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "counterfactual":
      return generateCounterfactualProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "modification":
      return generateModificationProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "alternative_approach":
      return generateAlternativeApproachProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "transfer":
      return generateTransferProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
    case "debugging":
      return generateDebuggingProbe(submission, mentalModel, spec, priorEvidenceSummary, chain, debuggingAttemptIndex);
    default: {
      const _exhaustive: never = spec.probeType;
      throw new Error(`Unhandled probe type: ${_exhaustive}`);
    }
  }
}
