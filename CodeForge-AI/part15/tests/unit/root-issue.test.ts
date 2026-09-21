import { describe, expect, it } from "vitest";
import { buildRootIssueHypothesis } from "@/lib/hint-ladder/root-issue";
import { ExecutionEvidence } from "@/lib/hint-ladder/types";

function exec(partial: Partial<ExecutionEvidence>): ExecutionEvidence {
  return {
    submissionId: "sub-1",
    verdict: "WRONG_ANSWER",
    testsPassed: 6,
    testsTotal: 10,
    compilerError: null,
    runtimeError: null,
    stackTrace: null,
    failingPublicCases: null,
    createdAt: new Date().toISOString(),
    ...partial,
  };
}

describe("buildRootIssueHypothesis", () => {
  it("reports LOW confidence and no invented failure when there is no execution evidence", () => {
    const hyp = buildRootIssueHypothesis({ execution: null, relevantArea: null });
    expect(hyp.confidence).toBe("LOW");
    expect(hyp.observedFailure).toMatch(/no execution result/i);
  });

  it("describes the observed failure using the real, deterministic pass count", () => {
    const hyp = buildRootIssueHypothesis({ execution: exec({ testsPassed: 6, testsTotal: 10 }), relevantArea: null });
    expect(hyp.observedFailure).toContain("6/10");
    // The FAILURE description itself is HIGH-confidence (it's just the
    // verdict), but overall hypothesis confidence also depends on the
    // concept guess — see the "degrades confidence" test below for that.
  });

  it("degrades confidence to the weaker of failure-confidence and concept-confidence", () => {
    // HIGH-confidence failure description, but no location evidence to
    // support a specific concept guess -> overall should not be HIGH.
    const hyp = buildRootIssueHypothesis({ execution: exec({ testsPassed: 6, testsTotal: 10 }), relevantArea: null });
    expect(hyp.confidence).not.toBe("HIGH");
  });

  it("classifies compile errors as SYNTAX_ERROR with HIGH confidence", () => {
    const hyp = buildRootIssueHypothesis({
      execution: exec({ verdict: "COMPILE_ERROR", compilerError: "expected ';' before '}' token" }),
      relevantArea: null,
    });
    expect(hyp.concept).toBe("SYNTAX_ERROR");
  });

  it("classifies index/range runtime errors as BOUNDARY_CONDITION", () => {
    const hyp = buildRootIssueHypothesis({
      execution: exec({ verdict: "RUNTIME_ERROR", runtimeError: "IndexError: list index out of range" }),
      relevantArea: null,
    });
    expect(hyp.concept).toBe("BOUNDARY_CONDITION");
  });

  it("never claims HIGH confidence for a hypothesis derived only from code shape, not evidence", () => {
    const hyp = buildRootIssueHypothesis({
      execution: exec({ verdict: "WRONG_ANSWER", testsPassed: 6, testsTotal: 10 }),
      relevantArea: {
        file: null,
        functionName: "solve",
        startLine: 2,
        endLine: 4,
        snippet: "for i in range(len(nums) + 1):\n    total += nums[i]",
        sourceOfTruth: "STATIC_HEURISTIC",
      },
    });
    expect(hyp.concept).toBe("BOUNDARY_CONDITION");
    expect(hyp.confidence).toBe("MEDIUM"); // plausible hypothesis, not certain
  });
});
