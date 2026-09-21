import { describe, expect, it } from "vitest";
import { analyzeEvidence } from "@/lib/hint-ladder/evidence-analyzer";
import { DEFAULT_MODE_POLICY_LIMITS, decideNextAction, PolicyInput } from "@/lib/hint-ladder/policy-engine";
import { DeliveredHintRecord, ExecutionEvidence } from "@/lib/hint-ladder/types";

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

function hint(overrides: Partial<DeliveredHintRecord>): DeliveredHintRecord {
  return {
    eventId: "e1",
    level: "DIRECTION",
    hintType: "DIRECTION",
    concept: "BOUNDARY_CONDITION",
    targetSignature: "BOUNDARY_CONDITION:loop_condition",
    text: "Look closely at how your loop handles the final valid element.",
    observation: "6/10 tests passed.",
    confidence: "MEDIUM",
    codeLocation: null,
    createdAt: new Date().toISOString(),
    executionSnapshotAtDelivery: { verdict: "WRONG_ANSWER", testsPassed: 6, testsTotal: 10 },
    studentResponse: null,
    effectiveness: "PENDING",
    source: "AI_GENERATED",
    ...overrides,
  };
}

const basePolicyInput = (overrides: Partial<PolicyInput>): PolicyInput => ({
  mode: "PRACTICE",
  modeLimits: DEFAULT_MODE_POLICY_LIMITS,
  currentLevel: "INDEPENDENT",
  consecutiveIneffectiveCount: 0,
  history: [],
  lastHint: null,
  currentExecution: exec({}),
  evidence: null,
  action: "REQUEST_HELP",
  studentResponse: null,
  ...overrides,
});

describe("decideNextAction — first hint", () => {
  it("delivers a DIRECTION-level hint on first request", () => {
    const decision = decideNextAction(basePolicyInput({}));
    expect(decision.kind).toBe("DELIVER_FIRST_HINT");
    expect(decision.targetLevel).toBe("DIRECTION");
    expect(decision.freshRootIssue).toBe(true);
  });
});

describe("decideNextAction — resolution", () => {
  it("recognizes ACCEPTED verdict as RESOLVED regardless of ladder position", () => {
    const priorHint = hint({ level: "TARGETED" });
    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "TARGETED",
        history: [priorHint],
        lastHint: priorHint,
        currentExecution: exec({ submissionId: "sub-2", verdict: "ACCEPTED", testsPassed: 10, testsTotal: 10 }),
        evidence: analyzeEvidence({
          executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
          currentExecution: exec({ submissionId: "sub-2", verdict: "ACCEPTED", testsPassed: 10, testsTotal: 10 }),
          codeAtLastHint: "a",
          currentCode: "b",
          hintedLocation: null,
          studentResponse: null,
        }),
      })
    );
    expect(decision.kind).toBe("RESOLVED");
    expect(decision.templatedMessage).toContain("10/10");
  });

  it("does NOT escalate further once resolved — no unnecessary additional hints", () => {
    // Simulates: direction hint -> student fixes issue -> submission accepted -> session resolved.
    const priorHint = hint({ level: "DIRECTION" });
    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "DIRECTION",
        history: [priorHint],
        lastHint: priorHint,
        currentExecution: exec({ submissionId: "sub-2", verdict: "ACCEPTED", testsPassed: 10, testsTotal: 10 }),
        evidence: analyzeEvidence({
          executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
          currentExecution: exec({ submissionId: "sub-2", verdict: "ACCEPTED", testsPassed: 10, testsTotal: 10 }),
          codeAtLastHint: "old",
          currentCode: "new",
          hintedLocation: null,
          studentResponse: null,
        }),
      })
    );
    expect(decision.kind).toBe("RESOLVED");
    expect(decision.targetLevel).toBe("DIRECTION"); // did not escalate past where it was solved
  });
});

describe("decideNextAction — partial improvement (6/10 -> 9/10)", () => {
  it("acknowledges progress and does not repeat the same hint", () => {
    const priorHint = hint({ level: "DIRECTION", hintType: "DIRECTION" });
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 9 }),
      codeAtLastHint: "def solve(nums):\n    for i in range(len(nums)):\n        pass",
      currentCode: "def solve(nums):\n    for i in range(len(nums) - 1):\n        pass",
      hintedLocation: { file: null, functionName: "solve", startLine: 2, endLine: 3, snippet: null, sourceOfTruth: "STATIC_HEURISTIC" },
      studentResponse: null,
    });
    expect(evidence.effectiveness).toBe("STRONG");

    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "DIRECTION",
        history: [priorHint],
        lastHint: priorHint,
        currentExecution: exec({ submissionId: "sub-2", testsPassed: 9 }),
        evidence,
      })
    );
    expect(decision.kind).toBe("ACKNOWLEDGE_PROGRESS_AND_CONTINUE");
    expect(decision.freshRootIssue).toBe(true); // remaining issue must be re-diagnosed, not assumed
    expect(decision.templatedMessage).toMatch(/6\/10.*9\/10|improved/i);
  });
});

describe("decideNextAction — failed hint adaptation", () => {
  it("changes STRATEGY (not just level) when a hint doesn't help, following the failed-hint chain", () => {
    const priorHint = hint({ level: "TARGETED", hintType: "CONCEPT" });
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
      codeAtLastHint: "same code region",
      currentCode: "same code region",
      hintedLocation: null,
      studentResponse: "STILL_STUCK",
    });
    expect(evidence.effectiveness).toBe("NEGATIVE");

    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "TARGETED",
        history: [priorHint],
        lastHint: priorHint,
        currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
        evidence,
        studentResponse: "STILL_STUCK",
      })
    );
    expect(decision.kind).toBe("ESCALATE_STRATEGY");
    expect(decision.targetLevel).toBe("TARGETED"); // same level
    expect(decision.targetHintType).toBe("QUESTION"); // next untried strategy after CONCEPT
  });

  it("escalates LEVEL once every strategy at the current level has been exhausted", () => {
    const history: DeliveredHintRecord[] = ["CONCEPT", "QUESTION", "EXAMPLE", "CODE_LOCATION", "EXPLANATION"].map((t) =>
      hint({ hintType: t as DeliveredHintRecord["hintType"], level: "TARGETED" })
    );
    const lastHint = history[history.length - 1]!;
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
      codeAtLastHint: "x",
      currentCode: "x",
      hintedLocation: null,
      studentResponse: "STILL_STUCK",
    });
    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "TARGETED",
        history,
        lastHint,
        currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
        evidence,
        studentResponse: "STILL_STUCK",
      })
    );
    expect(decision.kind).toBe("ESCALATE_LEVEL");
    expect(decision.targetLevel).toBe("SPECIFIC");
  });

  it("never redelivers an exact duplicate (concept+target+level+type)", () => {
    const priorHint = hint({ level: "TARGETED", hintType: "CONCEPT" });
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-1", testsPassed: 6 }),
      codeAtLastHint: "x",
      currentCode: "x",
      hintedLocation: null,
      studentResponse: "STILL_STUCK",
    });
    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "TARGETED",
        history: [priorHint],
        lastHint: priorHint,
        currentExecution: exec({ submissionId: "sub-1", testsPassed: 6 }),
        evidence,
        studentResponse: "STILL_STUCK",
      })
    );
    // Should never propose CONCEPT again at TARGETED for this exact target.
    expect(!(decision.targetHintType === "CONCEPT" && decision.targetLevel === "TARGETED")).toBe(true);
  });

  it("jumps more decisively to DETAILED after repeated ineffective hints (frustration sensitivity)", () => {
    const history: DeliveredHintRecord[] = ["CONCEPT", "QUESTION", "EXAMPLE", "CODE_LOCATION", "EXPLANATION"].map((t) =>
      hint({ hintType: t as DeliveredHintRecord["hintType"], level: "TARGETED" })
    );
    const lastHint = history[history.length - 1]!;
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
      codeAtLastHint: "x",
      currentCode: "x",
      hintedLocation: null,
      studentResponse: "STILL_STUCK",
    });
    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "TARGETED",
        history,
        lastHint,
        currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
        evidence,
        studentResponse: "STILL_STUCK",
        consecutiveIneffectiveCount: 3, // three prior ineffective hints already
      })
    );
    expect(decision.targetLevel).toBe("DETAILED");
  });
});

describe("decideNextAction — does not over-escalate on ambiguous/positive signals", () => {
  it("holds and encourages on MEDIUM evidence instead of generating a new AI hint", () => {
    const priorHint = hint({ level: "CONCEPT" });
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1" }),
      currentExecution: exec({ submissionId: "sub-1" }),
      codeAtLastHint: "def solve(nums):\n    return nums[0]",
      currentCode: "def solve(nums):\n    return nums[-1]",
      hintedLocation: { file: null, functionName: "solve", startLine: 1, endLine: 2, snippet: null, sourceOfTruth: "STATIC_HEURISTIC" },
      studentResponse: null,
    });
    const decision = decideNextAction(
      basePolicyInput({
        currentLevel: "CONCEPT",
        history: [priorHint],
        lastHint: priorHint,
        currentExecution: exec({ submissionId: "sub-1" }),
        evidence,
        action: "REQUEST_DEEPER",
      })
    );
    expect(decision.kind).toBe("HOLD_AND_ENCOURAGE");
  });
});

describe("decideNextAction — mode-aware policy ceilings (server-enforced)", () => {
  it("caps ASSESSMENT mode at DIRECTION even after many ineffective hints", () => {
    const history: DeliveredHintRecord[] = ["CONCEPT", "QUESTION", "EXAMPLE", "CODE_LOCATION", "EXPLANATION"].map((t) =>
      hint({ hintType: t as DeliveredHintRecord["hintType"], level: "DIRECTION" })
    );
    const lastHint = history[history.length - 1]!;
    const evidence = analyzeEvidence({
      executionAtLastHint: exec({ submissionId: "sub-1", testsPassed: 6 }),
      currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
      codeAtLastHint: "x",
      currentCode: "x",
      hintedLocation: null,
      studentResponse: "STILL_STUCK",
    });
    const decision = decideNextAction(
      basePolicyInput({
        mode: "ASSESSMENT",
        currentLevel: "DIRECTION",
        history,
        lastHint,
        currentExecution: exec({ submissionId: "sub-2", testsPassed: 6 }),
        evidence,
        studentResponse: "STILL_STUCK",
        consecutiveIneffectiveCount: 5,
      })
    );
    expect(decision.targetLevel).toBe("DIRECTION"); // cannot exceed ASSESSMENT ceiling
  });
});

describe("decideNextAction — solution reveal gating", () => {
  it("denies a solution request when policy/mode forbids it", () => {
    const decision = decideNextAction(
      basePolicyInput({
        mode: "ASSESSMENT",
        currentLevel: "DIRECTION",
        action: "REQUEST_SOLUTION",
        history: [hint({}), hint({})],
      })
    );
    expect(decision.kind).toBe("DENY_SOLUTION");
    expect(decision.denialReason).toBeTruthy();
  });

  it("denies a solution request when too few hints have been delivered, even in PRACTICE", () => {
    const decision = decideNextAction(
      basePolicyInput({
        mode: "PRACTICE",
        currentLevel: "DETAILED",
        action: "REQUEST_SOLUTION",
        history: [],
      })
    );
    expect(decision.kind).toBe("DENY_SOLUTION");
  });

  it("authorizes a solution request only when every gate passes", () => {
    const decision = decideNextAction(
      basePolicyInput({
        mode: "PRACTICE",
        currentLevel: "DETAILED",
        action: "REQUEST_SOLUTION",
        history: [hint({}), hint({}), hint({})],
      })
    );
    expect(decision.kind).toBe("DELIVER_SOLUTION");
    expect(decision.targetLevel).toBe("SOLUTION_ASSISTANCE");
  });
});
