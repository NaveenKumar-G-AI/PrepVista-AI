import { randomUUID } from "node:crypto";
import { classify } from "./deterministic/classify.js";
import { computeRequirementCoverage } from "./deterministic/requirementCoverage.js";
import { computeDelta } from "./deterministic/regression.js";
import { runStaticAnalysis } from "./staticAnalysis/index.js";
import { orchestrateAIAnalysis } from "./ai/orchestrator.js";
import type { AIProvider } from "./ai/provider.js";
import type { PromptInput } from "./ai/promptBuilder.js";
import type { CorrectnessAssessment, ExecutionEvidence, Requirement, DeterministicVerdict } from "./domain/types.js";
import type { Logger } from "./observability/logger.js";
import type { Metrics } from "./observability/metrics.js";

export interface AssembleInput {
  evidence: ExecutionEvidence;
  sourceCode: string;
  filename: string;
  requirements: Requirement[];
  previous: { verdict: DeterministicVerdict; evidence: ExecutionEvidence } | null;
}

export interface AssembleDeps {
  aiProvider: AIProvider | null;
  logger?: Logger;
  metrics?: Metrics;
  idGenerator?: () => string;
  now?: () => string;
  aiTimeoutMs?: number;
  correlationId?: string;
}

/**
 * The single entry point that produces a full CorrectnessAssessment.
 *
 * *** THIS IS WHERE THE EVIDENCE HIERARCHY IS FINAL-ENFORCED ***
 * `status` and `confidence` below are read ONLY from `deterministic`
 * (src/deterministic/classify.ts), which has zero AI involvement. The `ai`
 * field is attached for explanation/UI purposes but — no matter what the
 * model returns, no matter how a prompt injection attempt tries to steer
 * it — it is structurally impossible for `ai.result.statusAssessment` to
 * reach the `status` field below. See test/ai/promptInjection.test.ts and
 * test/e2e/golden.e2e.test.ts for adversarial proof of this.
 */
export async function assembleCorrectnessAssessment(
  input: AssembleInput,
  deps: AssembleDeps
): Promise<CorrectnessAssessment> {
  const deterministic = classify(input.evidence);

  const staticResult = await runStaticAnalysis(input.evidence.ref.language, input.sourceCode, input.filename);

  const requirementCoverage = computeRequirementCoverage(input.requirements, input.evidence, staticResult.findings);

  const delta = computeDelta(input.previous, { verdict: deterministic, evidence: input.evidence });

  const promptInput: PromptInput = {
    ref: input.evidence.ref,
    sourceCode: input.sourceCode,
    requirements: input.requirements,
    requirementCoverage,
    deterministic,
    staticFindings: staticResult.findings,
    previous: input.previous
      ? { status: input.previous.verdict.status, passRate: input.previous.verdict.passRateAvailable }
      : null,
  };

  const ai = await orchestrateAIAnalysis(promptInput, {
    provider: deps.aiProvider,
    logger: deps.logger,
    metrics: deps.metrics,
    timeoutMs: deps.aiTimeoutMs,
    correlationId: deps.correlationId,
  });

  return {
    id: (deps.idGenerator ?? randomUUID)(),
    ref: input.evidence.ref,
    status: deterministic.status, // AUTHORITATIVE — see doc comment above.
    confidence: deterministic.confidence.level, // AUTHORITATIVE — see doc comment above.
    deterministic,
    requirementCoverage,
    staticFindings: staticResult.findings,
    ai,
    delta,
    createdAt: (deps.now ?? (() => new Date().toISOString()))(),
  };
}

export * from "./domain/enums.js";
export * from "./domain/types.js";
export { classify } from "./deterministic/classify.js";
export { computeDelta } from "./deterministic/regression.js";
export { computeRequirementCoverage } from "./deterministic/requirementCoverage.js";
export { runStaticAnalysis } from "./staticAnalysis/index.js";
export { shouldInvokeAI } from "./ai/orchestrator.js";
