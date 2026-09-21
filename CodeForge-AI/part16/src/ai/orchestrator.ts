import { randomUUID } from "node:crypto";
import { ErrorCategory, CorrectnessStatus, AIDegradationReason } from "../domain/enums.js";
import type { CorrectnessAssessment, DeterministicVerdict } from "../domain/types.js";
import { buildPrompt, type PromptInput } from "./promptBuilder.js";
import { validateAndGround } from "./responseValidator.js";
import { AI_ANALYSIS_JSON_SCHEMA } from "../domain/schema.js";
import { AIProviderError, type AIProvider } from "./provider.js";
import type { Logger } from "../observability/logger.js";
import type { Metrics } from "../observability/metrics.js";
import { noopMetrics } from "../observability/metrics.js";
import { consoleLogger } from "../observability/logger.js";

export interface OrchestratorOptions {
  provider: AIProvider | null;
  logger?: Logger;
  metrics?: Metrics;
  timeoutMs?: number;
  maxRetries?: number;
  correlationId?: string;
}

/**
 * Deterministic policy for whether an AI call is even worth its cost.
 * Compile errors and fully-passing results already have a complete,
 * self-sufficient explanation from deterministic evidence alone — calling
 * an LLM there would be pure cost with no product value (see COST CONTROL).
 */
export function shouldInvokeAI(verdict: DeterministicVerdict): boolean {
  if (verdict.errorCategory === ErrorCategory.COMPILE_ERROR) return false;
  if (verdict.status === CorrectnessStatus.ACCEPTED) return false;
  if (verdict.status === CorrectnessStatus.LIKELY_CORRECT) return false;
  if (verdict.status === CorrectnessStatus.UNKNOWN) return false;
  return true;
}

export async function orchestrateAIAnalysis(
  input: PromptInput,
  opts: OrchestratorOptions
): Promise<CorrectnessAssessment["ai"]> {
  const logger = opts.logger ?? consoleLogger;
  const metrics = opts.metrics ?? noopMetrics;
  const correlationId = opts.correlationId ?? randomUUID();
  const timeoutMs = opts.timeoutMs ?? 8000;
  const maxRetries = opts.maxRetries ?? 1;

  const disabled = (reason: AIDegradationReason): CorrectnessAssessment["ai"] => ({
    available: false,
    degradationReason: reason,
    result: null,
    disagreedWithDeterministic: false,
  });

  if (!shouldInvokeAI(input.deterministic)) {
    logger.info("ai.skipped.not_needed", { correlationId, status: input.deterministic.status });
    return disabled(AIDegradationReason.DISABLED);
  }

  if (!opts.provider) {
    logger.info("ai.skipped.disabled", { correlationId });
    return disabled(AIDegradationReason.DISABLED);
  }

  const prompt = buildPrompt(input);
  let lastReason: AIDegradationReason = AIDegradationReason.NONE;
  let lastProvider = opts.provider.name;
  let lastModel = opts.provider.model;
  let lastLatency: number | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await opts.provider.complete({
        systemPrompt: prompt.systemPrompt,
        userPrompt: prompt.userPrompt,
        jsonSchema: AI_ANALYSIS_JSON_SCHEMA,
        schemaName: "correctness_analysis",
        timeoutMs,
      });
      lastProvider = response.provider;
      lastModel = response.model;
      lastLatency = response.latencyMs;
      metrics.timing("ai.latency_ms", response.latencyMs, { provider: response.provider });

      const validated = validateAndGround(response.rawText, prompt.offeredEvidenceIds);
      if (!validated.ok) {
        lastReason = AIDegradationReason.MALFORMED_RESPONSE;
        metrics.increment("ai.malformed_response", { provider: response.provider, attempt: String(attempt) });
        logger.warn("ai.malformed_response", { correlationId, attempt, reason: validated.reason });
        continue; // bounded retry
      }

      if (validated.droppedFindings > 0) {
        metrics.increment("ai.ungrounded_findings_dropped", { count: String(validated.droppedFindings) });
      }

      // *** EVIDENCE HIERARCHY ENFORCEMENT ***
      // validated.result.statusAssessment is the model's opinion. It is
      // recorded for observability/product-analytics ONLY. The
      // authoritative CorrectnessAssessment.status (assembled by the
      // caller in src/index.ts) is ALWAYS input.deterministic.status.
      // This function never returns a "status" field for that reason.
      const disagreed = validated.result.statusAssessment !== input.deterministic.status;
      if (disagreed) {
        metrics.increment("ai.disagreement_with_deterministic", {
          deterministic: input.deterministic.status,
          ai: validated.result.statusAssessment,
        });
        logger.warn("ai.disagreement_with_deterministic", {
          correlationId,
          deterministicStatus: input.deterministic.status,
          aiStatusAssessment: validated.result.statusAssessment,
        });
      }

      metrics.increment("ai.analysis_success", { provider: response.provider });
      return {
        available: true,
        degradationReason: AIDegradationReason.NONE,
        provider: lastProvider,
        model: lastModel,
        latencyMs: lastLatency,
        result: validated.result,
        disagreedWithDeterministic: disagreed,
      };
    } catch (err) {
      if (err instanceof AIProviderError) {
        lastReason =
          err.kind === "timeout"
            ? AIDegradationReason.TIMEOUT
            : err.kind === "rate_limited"
              ? AIDegradationReason.RATE_LIMITED
              : AIDegradationReason.PROVIDER_ERROR;
        metrics.increment("ai.provider_error", { kind: err.kind, provider: err.provider });
        logger.warn("ai.provider_error", { correlationId, kind: err.kind, message: err.message, attempt });
        if (err.kind === "rate_limited") break; // don't retry into a rate limit
        continue;
      }
      lastReason = AIDegradationReason.PROVIDER_ERROR;
      logger.error("ai.unexpected_error", { correlationId, message: (err as Error).message, attempt });
      break;
    }
  }

  // *** FAILURE ISOLATION ***
  // Every path above that doesn't `return` falls through to here: the
  // editor, execution, submission, and deterministic result are entirely
  // unaffected by AI failing. Only the enhanced explanation degrades.
  logger.info("ai.degraded", { correlationId, reason: lastReason });
  return disabled(lastReason === AIDegradationReason.NONE ? AIDegradationReason.PROVIDER_ERROR : lastReason);
}
