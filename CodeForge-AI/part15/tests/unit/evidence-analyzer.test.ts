import { describe, expect, it } from "vitest";
import { analyzeEvidence } from "@/lib/hint-ladder/evidence-analyzer";
import { CodeLocation, ExecutionEvidence } from "@/lib/hint-ladder/types";

const loc: CodeLocation = {
  file: null,
  functionName: "solve",
  startLine: 2,
  endLine: 4,
  snippet: "for i in range(len(nums)):\n    total += nums[i]",
  sourceOfTruth: "STATIC_HEURISTIC",
};

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

describe("analyzeEvidence", () => {
  it("STRONG: relevant region changed AND pass count improved", () => {
    const before = "def solve(nums):\n    total = 0\n    for i in range(len(nums)):\n        total += nums[i]\n    return total";
    const after = "def solve(nums):\n    total = 0\n    for i in range(len(nums) - 1):\n        total += nums[i]\n    return total";
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 9 }),
      codeAtLastHint: before,
      currentCode: after,
      hintedLocation: loc,
      studentResponse: null,
    });
    expect(result.effectiveness).toBe("STRONG");
    expect(result.relevantCodeChanged).toBe(true);
    expect(result.passCountDelta).toBe(3);
  });

  it("STRONG + fullyResolved when verdict becomes ACCEPTED", () => {
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 9, verdict: "WRONG_ANSWER" }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 10, testsTotal: 10, verdict: "ACCEPTED" }),
      codeAtLastHint: "old code",
      currentCode: "new code",
      hintedLocation: loc,
      studentResponse: null,
    });
    expect(result.effectiveness).toBe("STRONG");
    expect(result.fullyResolved).toBe(true);
  });

  it("MEDIUM: relevant region changed but no new submission yet", () => {
    const before = "def solve(nums):\n    return nums[0]";
    const after = "def solve(nums):\n    return nums[-1]";
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1" }),
      currentExecution: exec({ submissionId: "sub-1" }), // same submission id = no new submission
      codeAtLastHint: before,
      currentCode: after,
      hintedLocation: { ...loc, startLine: 1, endLine: 2 },
      studentResponse: null,
    });
    expect(result.effectiveness).toBe("MEDIUM");
  });

  it("WEAK: student says understood, but no code change and no new execution", () => {
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1" }),
      currentExecution: exec({ submissionId: "sub-1" }),
      codeAtLastHint: "same code",
      currentCode: "same code",
      hintedLocation: loc,
      studentResponse: "UNDERSTOOD",
    });
    expect(result.effectiveness).toBe("WEAK");
  });

  it("NEGATIVE: new submission, no relevant change, no improvement", () => {
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
      codeAtLastHint: "def solve(nums):\n    return nums[0]",
      currentCode: "def solve(nums):\n    # tried something unrelated\n    return nums[0]",
      hintedLocation: { ...loc, startLine: 1, endLine: 1 },
      studentResponse: null,
    });
    expect(result.effectiveness).toBe("NEGATIVE");
  });

  it("NEGATIVE: explicit still-stuck with no relevant change", () => {
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1" }),
      currentExecution: exec({ submissionId: "sub-1" }),
      codeAtLastHint: "same",
      currentCode: "same",
      hintedLocation: loc,
      studentResponse: "STILL_STUCK",
    });
    expect(result.effectiveness).toBe("NEGATIVE");
  });

  it("PENDING: nothing happened yet, no response given", () => {
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1" }),
      currentExecution: exec({ submissionId: "sub-1" }),
      codeAtLastHint: "same",
      currentCode: "same",
      hintedLocation: loc,
      studentResponse: "NONE",
    });
    expect(result.effectiveness).toBe("PENDING");
  });

  it("never falsely reports fullyResolved without an ACCEPTED verdict", () => {
    const result = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 9 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 9, verdict: "WRONG_ANSWER" }),
      codeAtLastHint: "a",
      currentCode: "b",
      hintedLocation: loc,
      studentResponse: null,
    });
    expect(result.fullyResolved).toBe(false);
  });
});
