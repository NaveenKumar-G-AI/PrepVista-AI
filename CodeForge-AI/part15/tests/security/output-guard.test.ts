import { describe, expect, it } from "vitest";
import { enforceOutputPolicy } from "@/lib/hint-ladder/output-guard";
import { PolicyDecision } from "@/lib/hint-ladder/policy-engine";
import { ModelHintResponse } from "@/lib/hint-ladder/schema";

function decision(overrides: Partial<PolicyDecision>): PolicyDecision {
  return {
    kind: "ESCALATE_STRATEGY",
    targetLevel: "TARGETED",
    targetHintType: "QUESTION",
    freshRootIssue: false,
    reason: "test",
    offerSolutionOption: false,
    ...overrides,
  };
}

function modelOutput(overrides: Partial<ModelHintResponse>): ModelHintResponse {
  return {
    assistance_level: "TARGETED",
    hint_type: "QUESTION",
    concept: "BOUNDARY_CONDITION",
    observation: "6/10 tests passed.",
    hint: "Which index does your loop process last?",
    target_area: "solve() loop",
    confidence: "MEDIUM",
    teaching_objective: "Understand the valid index range.",
    next_action: "await_student_response",
    solution_revealed: false,
    ...overrides,
  };
}

describe("enforceOutputPolicy — solution-reveal gating", () => {
  it("strips solution_revealed=true when the policy never authorized a solution", () => {
    const result = enforceOutputPolicy(
      modelOutput({ solution_revealed: true, hint: "The answer is to change the loop." }),
      decision({ kind: "ESCALATE_STRATEGY" })
    );
    expect(result.safe.solutionRevealed).toBe(false);
    expect(result.violations.some((v) => v.includes("solution_leakage_attempt"))).toBe(true);
  });

  it("passes solution_revealed=true through ONLY when policy authorized DELIVER_SOLUTION", () => {
    const result = enforceOutputPolicy(
      modelOutput({ assistance_level: "SOLUTION_ASSISTANCE", hint_type: "SOLUTION_ASSISTANCE", solution_revealed: true }),
      decision({ kind: "DELIVER_SOLUTION", targetLevel: "SOLUTION_ASSISTANCE", targetHintType: "SOLUTION_ASSISTANCE" })
    );
    expect(result.safe.solutionRevealed).toBe(true);
    expect(result.violations.length).toBe(0);
  });

  it("catches a full solution smuggled through even when the model claims solution_revealed=false", () => {
    const smuggled =
      "```python\ndef solve(nums):\n    total = 0\n    for i in range(len(nums)):\n        total += nums[i]\n    return total\n```";
    const result = enforceOutputPolicy(
      modelOutput({ solution_revealed: false, hint: smuggled }),
      decision({ kind: "ESCALATE_STRATEGY" })
    );
    expect(result.safe.hint).not.toContain("total += nums[i]");
    expect(result.violations.some((v) => v.includes("solution_leakage_attempt"))).toBe(true);
  });

  it("does not falsely flag a short, non-code conceptual hint as a solution leak", () => {
    const result = enforceOutputPolicy(
      modelOutput({ hint: "Think about what happens when the array has only one element." }),
      decision({ kind: "ESCALATE_STRATEGY" })
    );
    expect(result.violations.length).toBe(0);
    expect(result.safe.hint).toContain("one element");
  });
});

describe("enforceOutputPolicy — level/type clamping", () => {
  it("clamps to the assigned level when the model drifts to a different one", () => {
    const result = enforceOutputPolicy(
      modelOutput({ assistance_level: "DETAILED" }),
      decision({ targetLevel: "TARGETED", targetHintType: "QUESTION" })
    );
    expect(result.safe.assistanceLevel).toBe("TARGETED");
    expect(result.violations.some((v) => v.includes("model_returned_unassigned_level"))).toBe(true);
  });
});

describe("enforceOutputPolicy — hidden test data protection", () => {
  it("scrubs a claim about specific hidden test details", () => {
    const result = enforceOutputPolicy(
      modelOutput({ hint: "Hidden test #4 expects an empty list to return zero." }),
      decision({})
    );
    expect(result.safe.hint).not.toMatch(/hidden test/i);
    expect(result.violations.some((v) => v.includes("hidden_data_claim_removed"))).toBe(true);
  });

  it("scrubs a claim referencing the reference solution", () => {
    const result = enforceOutputPolicy(
      modelOutput({ observation: "This differs from the reference solution's approach." }),
      decision({})
    );
    expect(result.safe.observation).not.toMatch(/reference solution/i);
  });

  it("leaves ordinary, ungrounded-in-hidden-data hints untouched", () => {
    const result = enforceOutputPolicy(modelOutput({}), decision({}));
    expect(result.violations).toEqual([]);
    expect(result.safe.hint).toBe("Which index does your loop process last?");
  });
});
