import { describe, it, expect } from "vitest";
import { runConsistencyAnalysis } from "../src/engine/consistencyEngine";
import { NullAIProvider } from "../src/ai/provider";
import { fullyConsistentFixture, algorithmMismatchFixture, passingCodePoorUnderstandingFixture } from "./fixtures";

const aiProvider = new NullAIProvider();

describe("consistency engine end-to-end (deterministic fallback path, no AI keys)", () => {
  it("scores a fully consistent submission highly", async () => {
    const { adapters, submissionId, problemId } = fullyConsistentFixture();
    const result = await runConsistencyAnalysis({ submissionId, problemId, adapters, aiProvider });

    expect(result.overallScore).not.toBeNull();
    expect(["HIGHLY_CONSISTENT", "MOSTLY_CONSISTENT"]).toContain(result.overallState);

    const algo = result.dimensionResults.find((d) => d.dimension === "ALGORITHM_ALIGNMENT");
    const complexity = result.dimensionResults.find((d) => d.dimension === "COMPLEXITY_ALIGNMENT");
    expect(algo?.alignment).toBe("MATCH");
    expect(complexity?.alignment).toBe("MATCH");
  });

  it("flags an algorithm mismatch even though the complexity claim happens to match", async () => {
    const { adapters, submissionId, problemId } = algorithmMismatchFixture();
    const result = await runConsistencyAnalysis({ submissionId, problemId, adapters, aiProvider });

    const algo = result.dimensionResults.find((d) => d.dimension === "ALGORITHM_ALIGNMENT");
    const complexity = result.dimensionResults.find((d) => d.dimension === "COMPLEXITY_ALIGNMENT");
    expect(algo?.alignment).toBe("MISMATCH");
    expect(complexity?.alignment).toBe("MATCH");
    expect(result.findings.some((f) => f.dimension === "ALGORITHM_ALIGNMENT")).toBe(true);
  });

  it("distinguishes code correctness from reasoning consistency (core product principle)", async () => {
    const { adapters, submissionId, problemId } = passingCodePoorUnderstandingFixture();
    const result = await runConsistencyAnalysis({ submissionId, problemId, adapters, aiProvider });

    const algo = result.dimensionResults.find((d) => d.dimension === "ALGORITHM_ALIGNMENT");
    const correctness = result.dimensionResults.find((d) => d.dimension === "CORRECTNESS_ALIGNMENT");

    expect(algo?.alignment).toBe("MISMATCH");
    // Execution evidence is positive (tests pass), but the correctness ARGUMENT
    // shouldn't be a clean MATCH when it rests on a mismatched algorithm claim.
    expect(correctness?.alignment).not.toBe("MATCH");
  });

  it("produces a targeted, non-generic reconciliation question when there is a real mismatch", async () => {
    const { adapters, submissionId, problemId } = algorithmMismatchFixture();
    const result = await runConsistencyAnalysis({ submissionId, problemId, adapters, aiProvider });

    expect(result.recommendedReconciliationQuestion).not.toBeNull();
    const q = result.recommendedReconciliationQuestion!.question.toLowerCase();
    expect(q).not.toBe("can you explain more?");
    expect(q.length).toBeGreaterThan(20);
  });

  it("still returns a usable overall state when several dimensions have no dedicated fact source yet", async () => {
    const { adapters, submissionId, problemId } = fullyConsistentFixture();
    const result = await runConsistencyAnalysis({ submissionId, problemId, adapters, aiProvider });
    // PROBLEM/CONTROL_FLOW/BEHAVIOUR/IMPLEMENTATION_DECISION/OPTIMIZATION fall back to the generic
    // comparator in this build and should be INSUFFICIENT_EVIDENCE, not a fabricated verdict.
    const generic = result.dimensionResults.filter((d) =>
      ["CONTROL_FLOW_ALIGNMENT", "BEHAVIOUR_ALIGNMENT", "IMPLEMENTATION_DECISION_ALIGNMENT", "OPTIMIZATION_ALIGNMENT"].includes(d.dimension),
    );
    for (const g of generic) {
      expect(g.score).toBeNull();
      expect(g.alignment).toBe("UNKNOWN");
    }
    // Yet the overall pipeline still produces a confident state from the dimensions that DO have evidence.
    expect(result.overallState).not.toBe("INSUFFICIENT_EVIDENCE");
  });
});
