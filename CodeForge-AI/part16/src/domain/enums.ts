/**
 * Core enums for the Code Correctness Analysis Engine.
 *
 * These are intentionally string enums (not numeric) so that:
 *  - they serialize stably to JSON / Postgres text columns
 *  - they are self-describing in logs, DB rows, and API payloads
 *  - adding a new value never shifts the meaning of existing values
 */

/**
 * The correctness state of a single submission version.
 *
 * IMPORTANT: this value is ALWAYS derived deterministically from execution
 * evidence (see src/deterministic/classify.ts). The AI analysis layer is
 * never permitted to set or override this field — see
 * src/ai/orchestrator.ts and docs/EVIDENCE_HIERARCHY.md for the
 * enforcement mechanism and its tests.
 */
export enum CorrectnessStatus {
  /** No usable execution evidence exists yet (not yet run, or evidence lost). */
  UNKNOWN = "UNKNOWN",
  /** Available evidence is consistent with correctness but is not exhaustive. */
  LIKELY_CORRECT = "LIKELY_CORRECT",
  /** Some but not all requirements/tests are confirmed; a genuine mixed result. */
  PARTIALLY_VALIDATED = "PARTIALLY_VALIDATED",
  /** Evidence points strongly at incorrectness but isn't exhaustive/deterministic proof. */
  LIKELY_INCORRECT = "LIKELY_INCORRECT",
  /** Deterministic proof of incorrectness exists (compile error, crash, confirmed wrong answer on full evidence). */
  DEFINITIVELY_INCORRECT = "DEFINITIVELY_INCORRECT",
  /** The authoritative judge (full official test set, including hidden tests) accepted the submission. */
  ACCEPTED = "ACCEPTED",
}

/** How much confidence the *deterministic* evidence layer has in the status above. */
export enum ConfidenceLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
}

/** Outcome of a single test case execution. */
export enum TestOutcome {
  PASS = "PASS",
  WRONG_ANSWER = "WRONG_ANSWER",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  TIMEOUT = "TIMEOUT",
  MEMORY_EXCEEDED = "MEMORY_EXCEEDED",
  SKIPPED = "SKIPPED",
}

/** Deterministic top-level error category, when one applies. */
export enum ErrorCategory {
  NONE = "NONE",
  COMPILE_ERROR = "COMPILE_ERROR",
  RUNTIME_ERROR = "RUNTIME_ERROR",
  TIMEOUT = "TIMEOUT",
  MEMORY_LIMIT_EXCEEDED = "MEMORY_LIMIT_EXCEEDED",
  WRONG_ANSWER = "WRONG_ANSWER",
  OUTPUT_FORMAT_ERROR = "OUTPUT_FORMAT_ERROR",
}

/** How a failing test's output diverged from the expected output. */
export enum MismatchType {
  VALUE = "VALUE",
  ORDER = "ORDER",
  EXTRA_OUTPUT = "EXTRA_OUTPUT",
  MISSING_OUTPUT = "MISSING_OUTPUT",
  WHITESPACE_OR_FORMAT = "WHITESPACE_OR_FORMAT",
}

/** Coverage status for a single extracted problem requirement. */
export enum RequirementCoverageStatus {
  VALIDATED = "VALIDATED",
  PARTIALLY_VALIDATED = "PARTIALLY_VALIDATED",
  NOT_VALIDATED = "NOT_VALIDATED",
  VIOLATED = "VIOLATED",
  UNKNOWN = "UNKNOWN",
}

/** Languages the engine has language-aware analyzers for. */
export enum SupportedLanguage {
  C = "c",
  CPP = "cpp",
  JAVA = "java",
  JAVASCRIPT = "javascript",
  PYTHON = "python",
}

/** Non-fatal reasons the AI explanation layer produced no usable output. */
export enum AIDegradationReason {
  NONE = "NONE",
  TIMEOUT = "TIMEOUT",
  PROVIDER_ERROR = "PROVIDER_ERROR",
  MALFORMED_RESPONSE = "MALFORMED_RESPONSE",
  RATE_LIMITED = "RATE_LIMITED",
  DISABLED = "DISABLED",
}
