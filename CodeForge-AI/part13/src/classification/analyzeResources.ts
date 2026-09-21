import type { NormalizedExecutionResult, ResourceEvidence } from "../types/normalized.js";

export interface ResourceViolationReport {
  timeViolation: { violated: boolean; limitMs: number | null; observedMs: number | null };
  memoryViolation: { violated: boolean; limitKb: number | null; observedKb: number | null };
  outputViolation: { violated: boolean; limitBytes: number | null; observedBytes: number | null };
  processViolation: { violated: boolean };
  /** True only when the underlying evidence explicitly flags a violation — never inferred from proximity to a limit. */
  anyViolation: boolean;
}

/**
 * Pure pass-through/normalization of resource evidence. Deliberately does
 * NOT infer a violation from "usage is close to the limit" — only the
 * execution engine's explicit violation flags are authoritative, per the
 * "do not guess" requirement for resource violations.
 */
export function analyzeResourceEvidence(resources: ResourceEvidence): ResourceViolationReport {
  return {
    timeViolation: {
      violated: resources.violations.time,
      limitMs: resources.timeLimitMs,
      observedMs: resources.observedWallTimeMs,
    },
    memoryViolation: {
      violated: resources.violations.memory,
      limitKb: resources.memoryLimitKb,
      observedKb: resources.observedPeakMemoryKb,
    },
    outputViolation: {
      violated: resources.violations.output,
      limitBytes: resources.outputLimitBytes,
      observedBytes: resources.observedOutputBytes,
    },
    processViolation: { violated: resources.violations.process },
    anyViolation:
      resources.violations.time ||
      resources.violations.memory ||
      resources.violations.output ||
      resources.violations.process,
  };
}

/** Convenience wrapper operating directly on a normalized result. */
export function analyzeResources(result: NormalizedExecutionResult): ResourceViolationReport {
  return analyzeResourceEvidence(result.resources);
}
