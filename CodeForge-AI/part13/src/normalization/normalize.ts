import { rawExecutionEvidenceSchema } from "../schemas/rawEvidence.schema.js";
import type { RawExecutionEvidence } from "../types/raw.js";
import type { NormalizedExecutionResult, TestAggregate, ScoringResult } from "../types/normalized.js";

export type NormalizationFailureReason = "SCHEMA_VALIDATION_FAILED" | "INTERNALLY_INCONSISTENT";

export interface NormalizationFailure {
  ok: false;
  reason: NormalizationFailureReason;
  /** Safe-for-logs detail. Never includes secrets or filesystem paths. */
  detail: string;
  issues?: string[];
}

export interface NormalizationSuccess {
  ok: true;
  result: NormalizedExecutionResult;
}

export type NormalizationOutcome = NormalizationSuccess | NormalizationFailure;

function aggregateTests(tests: RawExecutionEvidence["tests"]): TestAggregate {
  const agg: TestAggregate = {
    total: tests.length,
    passed: 0,
    failed: 0,
    errored: 0,
    skipped: 0,
    notExecuted: 0,
    completed: 0,
  };
  for (const t of tests) {
    switch (t.status) {
      case "PASSED":
        agg.passed++;
        break;
      case "FAILED":
        agg.failed++;
        break;
      case "ERROR":
        agg.errored++;
        break;
      case "SKIPPED":
        agg.skipped++;
        break;
      case "NOT_EXECUTED":
        agg.notExecuted++;
        break;
    }
  }
  agg.completed = agg.passed + agg.failed + agg.errored;
  return agg;
}

function buildScoring(raw: RawExecutionEvidence): ScoringResult {
  const { scoring } = raw;
  if (scoring.strategy === null) {
    return {
      strategy: null,
      score: null,
      maxScore: null,
      percentage: null,
      passedGroups: null,
      failedGroups: null,
    };
  }

  const percentage =
    scoring.score !== null && scoring.maxScore !== null && scoring.maxScore > 0
      ? Math.round((scoring.score / scoring.maxScore) * 10000) / 100
      : null;

  const passedGroups = scoring.groups ? scoring.groups.filter((g) => g.passed).map((g) => g.groupId) : null;
  const failedGroups = scoring.groups ? scoring.groups.filter((g) => !g.passed).map((g) => g.groupId) : null;

  return {
    strategy: scoring.strategy,
    score: scoring.score,
    maxScore: scoring.maxScore,
    percentage,
    passedGroups,
    failedGroups,
  };
}

/**
 * Internal-consistency checks that schema validation alone can't catch.
 * These protect against malformed-but-schema-valid evaluator payloads.
 */
function findConsistencyIssues(raw: RawExecutionEvidence): string[] {
  const issues: string[] = [];

  if (raw.completedEvaluationCount > raw.requiredEvaluationCount) {
    issues.push("completedEvaluationCount exceeds requiredEvaluationCount");
  }

  const testIds = new Set<string>();
  for (const t of raw.tests) {
    if (testIds.has(t.testId)) {
      issues.push(`duplicate testId in evidence payload: ${t.testId}`);
    }
    testIds.add(t.testId);
  }

  if (raw.resources.violations.time && raw.resources.observedWallTimeMs === null) {
    issues.push("time violation flagged but no observed wall time provided");
  }
  if (raw.resources.violations.memory && raw.resources.observedPeakMemoryKb === null) {
    issues.push("memory violation flagged but no observed peak memory provided");
  }

  if (raw.compilation.status === "FAILED" && raw.compilation.error === null) {
    issues.push("compilation marked FAILED but no compiler error evidence provided");
  }

  const scoring = raw.scoring;
  if (scoring.strategy === "WEIGHTED_GROUPS" && !scoring.groups) {
    issues.push("WEIGHTED_GROUPS scoring strategy declared but no groups provided");
  }
  if (scoring.score !== null && scoring.maxScore !== null && scoring.score > scoring.maxScore) {
    issues.push("score exceeds maxScore");
  }

  return issues;
}

/**
 * Normalize a raw, executor-shaped evidence payload into the CodeForge
 * internal representation. Never throws — malformed payloads are rejected
 * safely via a typed failure result so callers can route them to
 * observability + JUDGE_ERROR handling instead of crashing the pipeline.
 */
export function normalizeExecutionEvidence(input: unknown): NormalizationOutcome {
  const parsed = rawExecutionEvidenceSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      reason: "SCHEMA_VALIDATION_FAILED",
      detail: "Executor payload failed schema validation.",
      issues: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`),
    };
  }

  const raw = parsed.data as RawExecutionEvidence;

  const consistencyIssues = findConsistencyIssues(raw);
  if (consistencyIssues.length > 0) {
    return {
      ok: false,
      reason: "INTERNALLY_INCONSISTENT",
      detail: "Executor payload was schema-valid but internally inconsistent.",
      issues: consistencyIssues,
    };
  }

  const infraFlags = raw.infrastructure;
  const hadFailure =
    infraFlags.evaluatorCrashed ||
    infraFlags.malformedEvaluatorResponse ||
    infraFlags.sandboxInfrastructureFailure ||
    infraFlags.databaseFailureDuringEvaluation ||
    infraFlags.workerCrashed ||
    infraFlags.queueRetryExhausted ||
    infraFlags.networkInterruption;

  const reasons: string[] = [];
  let origin: NormalizedExecutionResult["infrastructure"]["origin"] = null;
  if (infraFlags.evaluatorCrashed) {
    reasons.push("evaluatorCrashed");
    origin = "JUDGE_EVALUATOR";
  }
  if (infraFlags.malformedEvaluatorResponse) {
    reasons.push("malformedEvaluatorResponse");
    origin = "JUDGE_EVALUATOR";
  }
  if (infraFlags.sandboxInfrastructureFailure) {
    reasons.push("sandboxInfrastructureFailure");
    origin = origin ?? "PLATFORM_INFRASTRUCTURE";
  }
  if (infraFlags.databaseFailureDuringEvaluation) {
    reasons.push("databaseFailureDuringEvaluation");
    origin = origin ?? "PLATFORM_INFRASTRUCTURE";
  }
  if (infraFlags.workerCrashed) {
    reasons.push("workerCrashed");
    origin = origin ?? "PLATFORM_INFRASTRUCTURE";
  }
  if (infraFlags.queueRetryExhausted) {
    reasons.push("queueRetryExhausted");
    origin = origin ?? "PLATFORM_INFRASTRUCTURE";
  }
  if (infraFlags.networkInterruption) {
    reasons.push("networkInterruption");
    origin = origin ?? "PLATFORM_INFRASTRUCTURE";
  }

  const isComplete =
    raw.requiredEvaluationCount > 0 && raw.completedEvaluationCount >= raw.requiredEvaluationCount;

  const result: NormalizedExecutionResult = {
    submissionId: raw.submissionId,
    evaluationId: raw.evaluationId,
    language: raw.language,
    versionBinding: {
      problemId: raw.problemId,
      problemVersion: raw.problemVersion,
      testSuiteVersion: raw.testSuiteVersion,
      checkerVersion: raw.checkerVersion,
      compilerVersion: raw.compilerVersion,
      runtimeVersion: raw.runtimeVersion,
      executionEnvironmentId: raw.executionEnvironmentId,
    },
    compilation: {
      status: raw.compilation.status,
      durationMs: raw.compilation.durationMs,
      error: raw.compilation.error,
    },
    runtime: {
      status: raw.execution.status,
      exitCode: raw.execution.exitCode,
      signal: raw.execution.signal,
      terminationReason: raw.execution.terminationReason,
      failureCategory: raw.runtimeError?.category ?? null,
      failureMessage: raw.runtimeError?.message ?? null,
    },
    resources: {
      timeLimitMs: raw.resources.timeLimitMs,
      observedWallTimeMs: raw.resources.observedWallTimeMs,
      observedCpuTimeMs: raw.resources.observedCpuTimeMs,
      memoryLimitKb: raw.resources.memoryLimitKb,
      observedPeakMemoryKb: raw.resources.observedPeakMemoryKb,
      outputLimitBytes: raw.resources.outputLimitBytes,
      observedOutputBytes: raw.resources.observedOutputBytes,
      violations: raw.resources.violations,
    },
    tests: [...raw.tests]
      .sort((a, b) => a.order - b.order)
      .map((t) => ({
        testId: t.testId,
        visibility: t.visibility,
        order: t.order,
        status: t.status,
        durationMs: t.durationMs,
        memoryKb: t.memoryKb,
        terminationReason: t.terminationReason,
        failureCategory: t.failureCategory,
      })),
    testAggregate: aggregateTests(raw.tests),
    scoring: buildScoring(raw),
    completeness: {
      required: raw.requiredEvaluationCount,
      completed: raw.completedEvaluationCount,
      isComplete,
    },
    infrastructure: { hadFailure, origin, reasons },
    evaluatedAtIso: raw.evaluatedAtIso,
    normalizedAtIso: new Date().toISOString(),
  };

  return { ok: true, result };
}
