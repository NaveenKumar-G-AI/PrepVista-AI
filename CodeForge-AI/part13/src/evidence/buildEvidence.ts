import type { NormalizedExecutionResult } from "../types/normalized.js";
import { analyzeResources, type ResourceViolationReport } from "../classification/analyzeResources.js";
import { classifyVerdict, type ClassificationResult } from "../classification/classifyVerdict.js";

/**
 * Structured evidence bundle:
 *   Execution Evidence
 *   ├── Compilation
 *   ├── Correctness
 *   ├── Runtime
 *   ├── Resources
 *   ├── Termination
 *   └── Infrastructure
 *
 * Every field here traces back to a concrete field in NormalizedExecutionResult.
 * Nothing in this module invents data.
 */
export interface ExecutionEvidenceBundle {
  compilation: NormalizedExecutionResult["compilation"];
  correctness: {
    testAggregate: NormalizedExecutionResult["testAggregate"];
    scoring: NormalizedExecutionResult["scoring"];
  };
  runtime: NormalizedExecutionResult["runtime"];
  resources: ResourceViolationReport;
  termination: {
    exitCode: number | null;
    signal: string | null;
    terminationReason: string | null;
  };
  infrastructure: NormalizedExecutionResult["infrastructure"];
  classification: ClassificationResult;
}

export function buildEvidenceBundle(result: NormalizedExecutionResult): ExecutionEvidenceBundle {
  const classification = classifyVerdict(result);
  return {
    compilation: result.compilation,
    correctness: {
      testAggregate: result.testAggregate,
      scoring: result.scoring,
    },
    runtime: result.runtime,
    resources: analyzeResources(result),
    termination: {
      exitCode: result.runtime.exitCode,
      signal: result.runtime.signal,
      terminationReason: result.runtime.terminationReason,
    },
    infrastructure: result.infrastructure,
    classification,
  };
}
