import { describe, expect, it } from "vitest";
import { normalizeExecutionEvidence } from "../src/normalization/normalize.js";
import { finalizeResult } from "../src/finalize/finalizeResult.js";
import { baseRawEvidence } from "./fixtures.js";

function normalizeOrThrow(raw: ReturnType<typeof baseRawEvidence>) {
  const outcome = normalizeExecutionEvidence(raw);
  if (!outcome.ok) throw new Error("fixture failed to normalize");
  return outcome.result;
}

describe("finalizeResult", () => {
  it("finalizes a complete, consistent evaluation", () => {
    const result = normalizeOrThrow(baseRawEvidence());
    const outcome = finalizeResult(result);
    expect(outcome.kind).toBe("FINALIZED");
    if (outcome.kind === "FINALIZED") {
      expect(outcome.verdict).toBe("ACCEPTED");
      expect(outcome.resultHash).toHaveLength(64);
    }
  });

  it("refuses to finalize an incomplete evaluation (never presents partial as normal failure)", () => {
    const raw = baseRawEvidence({ requiredEvaluationCount: 10, completedEvaluationCount: 6 });
    const result = normalizeOrThrow(raw);
    const outcome = finalizeResult(result);
    expect(outcome.kind).toBe("NOT_FINALIZED");
    if (outcome.kind === "NOT_FINALIZED") {
      expect(outcome.reason).toBe("EVALUATION_INCOMPLETE");
      expect(outcome.detail).toMatch(/6\/10/);
    }
  });

  it("refuses to re-finalize an already-finalized evaluation (immutability)", () => {
    const result = normalizeOrThrow(baseRawEvidence());
    const outcome = finalizeResult(result, { alreadyFinalized: true });
    expect(outcome.kind).toBe("NOT_FINALIZED");
    if (outcome.kind === "NOT_FINALIZED") {
      expect(outcome.reason).toBe("ALREADY_FINALIZED_IMMUTABLE");
    }
  });

  it("produces identical hashes for identical version-bound results", () => {
    const raw = baseRawEvidence();
    const r1 = finalizeResult(normalizeOrThrow(raw));
    const r2 = finalizeResult(normalizeOrThrow(raw));
    expect(r1.kind).toBe("FINALIZED");
    expect(r2.kind).toBe("FINALIZED");
    if (r1.kind === "FINALIZED" && r2.kind === "FINALIZED") {
      expect(r1.resultHash).toBe(r2.resultHash);
    }
  });

  it("produces a different hash when the problem version differs (re-evaluation against new version is distinguishable)", () => {
    const r1 = finalizeResult(normalizeOrThrow(baseRawEvidence({ problemVersion: "v1" })));
    const r2 = finalizeResult(normalizeOrThrow(baseRawEvidence({ problemVersion: "v2", evaluationId: "eval_2" })));
    if (r1.kind === "FINALIZED" && r2.kind === "FINALIZED") {
      expect(r1.resultHash).not.toBe(r2.resultHash);
    }
  });

  it("never finalizes a JUDGE_ERROR result as a student-failure verdict", () => {
    const raw = baseRawEvidence({
      infrastructure: {
        evaluatorCrashed: true,
        malformedEvaluatorResponse: false,
        sandboxInfrastructureFailure: false,
        databaseFailureDuringEvaluation: false,
        workerCrashed: false,
        queueRetryExhausted: false,
        networkInterruption: false,
      },
    });
    const outcome = finalizeResult(normalizeOrThrow(raw));
    expect(outcome.kind).toBe("FINALIZED");
    if (outcome.kind === "FINALIZED") {
      expect(outcome.verdict).toBe("JUDGE_ERROR");
      expect(outcome.origin).toBe("JUDGE_EVALUATOR");
    }
  });
});
