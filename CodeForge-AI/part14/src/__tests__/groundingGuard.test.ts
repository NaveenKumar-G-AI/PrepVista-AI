import { describe, it, expect } from "vitest";
import { checkGrounding, sanitizeAgainstGrounding } from "../security/groundingGuard";
import type { AssembledCoachingContext } from "../types";
import type { CoachResponse } from "../schema";

function baseCtx(overrides: Partial<AssembledCoachingContext> = {}): AssembledCoachingContext {
  return {
    problem: { problemId: "p1", title: "Sum Array", statement: "Return the sum.", constraints: [], examples: [] },
    code: { language: "python", source: "def solve(a):\n    return sum(a)\n" },
    evidence: { hasExecuted: false, verdict: "NO_EXECUTION", raw: null },
    history: [],
    state: { sessionId: "s1", coachingDepth: 1, previousHints: [], previousObservations: [], unresolvedIssues: [], resolvedIssues: [] },
    request: { requestedMode: "HINT" },
    policyMode: "practice",
    ...overrides,
  };
}

describe("groundingGuard", () => {
  it("flags a fabricated test-failure claim when nothing has executed", () => {
    const ctx = baseCtx();
    const response: CoachResponse = {
      response_type: "OBSERVATION",
      observation: "Your code fails on test 4 because of an index error.",
      code_locations: [],
      confidence: "HIGH",
      coaching_level: 1,
      solution_reveal: false,
    };
    const issues = checkGrounding(ctx, response);
    expect(issues.some((i) => i.field === "observation")).toBe(true);

    const safe = sanitizeAgainstGrounding(response, issues);
    expect(safe.observation).toMatch(/has not been executed/);
    expect(safe.confidence).toBe("LOW");
  });

  it("allows the same kind of claim once real execution evidence exists", () => {
    const ctx = baseCtx({ evidence: { hasExecuted: true, verdict: "WRONG_ANSWER", testsPassed: 3, testsTotal: 4, raw: null } });
    const response: CoachResponse = {
      response_type: "OBSERVATION",
      observation: "One of the four cases produced the wrong output.",
      code_locations: [],
      confidence: "MEDIUM",
      coaching_level: 1,
      solution_reveal: false,
    };
    expect(checkGrounding(ctx, response)).toHaveLength(0);
  });

  it("rejects a fabricated line number outside the source window", () => {
    const ctx = baseCtx();
    const response: CoachResponse = {
      response_type: "HINT",
      observation: "Check this line.",
      code_locations: [{ line: 999 }],
      confidence: "LOW",
      coaching_level: 1,
      solution_reveal: false,
    };
    const issues = checkGrounding(ctx, response);
    expect(issues.some((i) => i.field === "code_locations")).toBe(true);

    const safe = sanitizeAgainstGrounding(response, issues);
    expect(safe.code_locations).toEqual([]);
  });

  it("blocks solution_reveal in assessment mode even when the model tries", () => {
    const ctx = baseCtx({ policyMode: "assessment" });
    const response: CoachResponse = {
      response_type: "SOLUTION_ASSISTANCE",
      observation: "Here is the full corrected solution...",
      code_locations: [],
      confidence: "MEDIUM",
      coaching_level: 3,
      solution_reveal: true,
    };
    const issues = checkGrounding(ctx, response);
    expect(issues.some((i) => i.field === "solution_reveal")).toBe(true);

    const safe = sanitizeAgainstGrounding(response, issues);
    expect(safe.solution_reveal).toBe(false);
    expect(safe.response_type).not.toBe("SOLUTION_ASSISTANCE");
  });
});
