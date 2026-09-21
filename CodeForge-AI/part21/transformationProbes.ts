/**
 * Transformation generators: Counterfactual, Modification (Adaptation),
 * Debugging (Code Mutation), Alternative Approach, Transfer.
 *
 * Debugging probes are the only ones that require a two-step AI flow:
 * first mutate a COPY of the source (never the student's stored
 * submission — see security note below), then build a probe around the
 * mutated version. The mutation's description/kind is answer-adjacent, so
 * it is folded into `expected_evidence` (server-only, stripped by
 * toPublicProbe) and NEVER placed on `grounding`, which is what the
 * student actually sees.
 */
import { CodeMutationSchema, GeneratedProbeSchema } from "@/ai/schemas.js";
import { buildMutationPrompt, buildProbeGenerationPrompt } from "@/ai/prompts.js";
import { structuredCall, type StructuredCallOutcome } from "@/ai/structuredCall.js";
import type { ProviderChain } from "@/ai/provider.js";
import type { CodeMutationAI } from "@/ai/schemas.js";
import type { MentalModel, StudentSubmission } from "@/types/index.js";
import type { ProbeSpec } from "@/understanding/probeEngine.js";
import { generateGroundedProbe, type GenerateProbeContentResult } from "./executionProbes.js";

export async function generateCounterfactualProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  return generateGroundedProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
}

export async function generateModificationProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  const note = "Frame this as a concrete changed requirement (different objective, constraint, streaming input, lower memory limit, different output, duplicate handling, or ordering requirement). Ask HOW the solution must change conceptually, not just for updated code.";
  return generateGroundedProbe(submission, mentalModel, spec, `${priorEvidenceSummary}\n${note}`, chain);
}

export async function generateAlternativeApproachProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  return generateGroundedProbe(submission, mentalModel, spec, priorEvidenceSummary, chain);
}

export async function generateTransferProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain
): Promise<GenerateProbeContentResult> {
  const note = "The transfer target must be a genuinely different problem that requires the SAME underlying concept — never a renamed or reworded version of this problem.";
  return generateGroundedProbe(submission, mentalModel, spec, `${priorEvidenceSummary}\n${note}`, chain);
}

// ---------------------------------------------------------------------------
// Debugging (code mutation)
// ---------------------------------------------------------------------------

const MUTATION_KINDS: CodeMutationAI["mutation_kind"][] = [
  "remove_state_update",
  "change_comparison",
  "alter_loop_boundary",
  "change_initialization",
  "remove_validation",
  "change_data_structure_operation",
];

export interface MutationCheck {
  isLocalized: boolean;
  changedLineCount: number;
}

/** Rough, dependency-free localization check: mutation should touch a small
 *  minority of lines. Not a strict gate (an AI-produced mutation that fails
 *  this is still usable — the check is informational/observability, logged
 *  so a consistently non-localized provider/model can be noticed), because
 *  a strict line-diff can false-positive on reformatting-only changes. */
export function checkMutationLocalized(original: string, mutated: string): MutationCheck {
  const a = original.split("\n");
  const b = mutated.split("\n");
  const len = Math.max(a.length, b.length);
  let changed = 0;
  for (let i = 0; i < len; i++) {
    if (a[i] !== b[i]) changed++;
  }
  const threshold = Math.max(3, Math.ceil(a.length * 0.15));
  return { isLocalized: changed <= threshold, changedLineCount: changed };
}

export interface GenerateDebuggingProbeResult {
  probeOutcome: StructuredCallOutcome<unknown>;
  mutationOutcome: StructuredCallOutcome<CodeMutationAI>;
  mutatedCode: string | null;
  mutationCheck: MutationCheck | null;
}

export async function generateDebuggingProbe(
  submission: StudentSubmission,
  mentalModel: MentalModel,
  spec: ProbeSpec,
  priorEvidenceSummary: string,
  chain: ProviderChain,
  debuggingAttemptIndex: number
): Promise<GenerateDebuggingProbeResult & GenerateProbeContentResult> {
  const mutationKind = MUTATION_KINDS[debuggingAttemptIndex % MUTATION_KINDS.length]!;
  const { systemPrompt, userContent } = buildMutationPrompt(submission.source_code, submission.language, mutationKind);

  const mutationOutcome = await structuredCall({ chain, schema: CodeMutationSchema, systemPrompt, userContent });

  if (!mutationOutcome.ok) {
    return {
      outcome: { ok: false, reason: `Mutation step failed: ${mutationOutcome.reason}` },
      grounding: {},
      probeOutcome: { ok: false, reason: mutationOutcome.reason },
      mutationOutcome,
      mutatedCode: null,
      mutationCheck: null,
    };
  }

  const mutationCheck = checkMutationLocalized(submission.source_code, mutationOutcome.data.mutated_code);

  const debugContext = `A mutated (buggy) version of this code has been prepared. It will be shown to the
student instead of code you generate. Write the probe question as: "Here is a modified version of your
solution. It fails. Why?" — the mutated code itself is shown separately, do not repeat it in the question
text. expected_evidence MUST require, in order: (1) identifying the bug, (2) its root cause, (3) which
state it affects, (4) which invariant it breaks, (5) the observed failure mode, (6) the correct fix —
merely naming the broken line is NOT sufficient for full credit.
Ground truth — what actually changed (for your grading criteria only, do not put this in the question):
kind=${mutationOutcome.data.mutation_kind}, change="${mutationOutcome.data.mutation_description}".`;

  const { systemPrompt: probeSystemPrompt, userContent: probeUserContent } = buildProbeGenerationPrompt({
    submission,
    mentalModel,
    targetDimension: spec.dimension,
    probeType: spec.probeType,
    difficulty: spec.difficulty,
    priorEvidenceSummary: `${priorEvidenceSummary}\n${debugContext}`,
  });

  const probeOutcome = await structuredCall({
    chain,
    schema: GeneratedProbeSchema,
    systemPrompt: probeSystemPrompt,
    userContent: probeUserContent,
  });

  return {
    outcome: probeOutcome,
    probeOutcome,
    mutationOutcome,
    mutatedCode: mutationOutcome.data.mutated_code,
    mutationCheck,
    grounding: {
      mutated_code: mutationOutcome.data.mutated_code,
      execution_fact: submission.execution.ran
        ? `Original (unmutated) solution passed ${submission.execution.passed_tests}/${submission.execution.total_tests} tests.`
        : undefined,
    },
  };
}


