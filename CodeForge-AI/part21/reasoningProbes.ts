/**
 * Causal-reasoning generators: Explanation, Causal Why, Invariant, Complexity.
 *
 * Invariant probes get an explicit weighting note carried through to
 * scoringEngine.ts (PROBE_TYPE_BASE_WEIGHT.invariant = 0.8, the top of the
 * "moderate" band) per the spec: "This is a high-value signal and must
 * receive significant weight." Complexity probes always thread through
 * whatever CodeForge's existing complexity analyzer already determined
 * (see mentalModel.ts), so the AI is only asked to probe the *justification*
 * — a memorized label alone cannot satisfy expected_evidence.
 */
import type { ProviderChain } from "@/ai/provider.js";
import type { MentalModel, StudentSubmission } from "@/types/index.js";
import type { ProbeSpec } from "@/understanding/probeEngine.js";
import { generateGroundedProbe, type GenerateProbeContentResult } from "./executionProbes.js";

export async function generateExplanationProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  return generateGroundedProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
}

export async function generateCausalWhyProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  return generateGroundedProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
}

export async function generateInvariantProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  const invariantContext = mentalModel.candidate_invariants.length
    ? `Candidate invariants already extracted from this code: ${mentalModel.candidate_invariants.join(" | ")}. Ask about what must remain true, why it remains true, and why correctness depends on it — not just to restate it.`
    : "";
  return generateGroundedProbe(submission, mentalModel, spec, `${priorEvidenceSummary}\n${invariantContext}`, chain);
}

export async function generateComplexityProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  const knownComplexity = `Known complexity (ground truth — do not ask the student to restate this number; ask them to justify it from the actual operations): time=${mentalModel.complexity.time}, space=${mentalModel.complexity.space}.`;
  return generateGroundedProbe(submission, mentalModel, spec, `${priorEvidenceSummary}\n${knownComplexity}`, chain);
}
