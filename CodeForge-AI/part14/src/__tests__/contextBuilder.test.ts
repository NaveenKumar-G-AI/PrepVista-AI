import { describe, it, expect } from "vitest";
import { buildCoachingContext } from "../context/contextBuilder";

const baseState = { sessionId: "s1", coachingDepth: 1, previousHints: [], previousObservations: [], unresolvedIssues: [], resolvedIssues: [] };

describe("contextBuilder", () => {
  it("never forwards hidden tests or a reference solution into the assembled context", () => {
    const ctx = buildCoachingContext({
      problem: {
        id: "p1",
        title: "T",
        statement: "S",
        constraints: [],
        publicExamples: [],
        hiddenTests: [{ input: "secret-input", output: "secret-output" }],
        referenceSolution: "def solve(): return 42",
      },
      code: { language: "python", source: "print(1)" },
      latestExecution: null,
      history: [],
      state: baseState,
      request: { requestedMode: "HINT" },
      policyMode: "practice",
    });
    const serialized = JSON.stringify(ctx);
    expect(serialized).not.toContain("secret-input");
    expect(serialized).not.toContain("def solve(): return 42");
    expect((ctx.problem as any).hiddenTests).toBeUndefined();
    expect((ctx.problem as any).referenceSolution).toBeUndefined();
  });

  it("marks evidence as not executed with NO_EXECUTION when nothing has run", () => {
    const ctx = buildCoachingContext({
      problem: { id: "p1", title: "T", statement: "S", constraints: [], publicExamples: [] },
      code: { language: "python", source: "print(1)" },
      latestExecution: null,
      history: [],
      state: baseState,
      request: { requestedMode: "HINT" },
      policyMode: "practice",
    });
    expect(ctx.evidence.hasExecuted).toBe(false);
    expect(ctx.evidence.verdict).toBe("NO_EXECUTION");
  });

  it("surfaces only a boolean hidden-evaluation signal, never counts", () => {
    const ctx = buildCoachingContext({
      problem: { id: "p1", title: "T", statement: "S", constraints: [], publicExamples: [] },
      code: { language: "python", source: "print(1)" },
      latestExecution: {
        executed: true,
        verdict: "WRONG_ANSWER",
        publicTestsPassed: 3,
        publicTestsTotal: 3,
        hiddenTestsPassed: 7,
        hiddenTestsTotal: 10,
      },
      history: [],
      state: baseState,
      request: { requestedMode: "HINT" },
      policyMode: "practice",
    });
    expect(ctx.evidence.hiddenEvaluationFailed).toBe(true);
    expect(JSON.stringify(ctx)).not.toContain("hiddenTestsPassed");
    expect(JSON.stringify(ctx)).not.toContain('"7"');
  });

  it("truncates oversized source instead of sending it in full", () => {
    const bigSource = "x = 1\n".repeat(5000);
    const ctx = buildCoachingContext({
      problem: { id: "p1", title: "T", statement: "S", constraints: [], publicExamples: [] },
      code: { language: "python", source: bigSource },
      latestExecution: null,
      history: [],
      state: baseState,
      request: { requestedMode: "HINT" },
      policyMode: "practice",
      maxSourceChars: 500,
    });
    expect(ctx.code.source.length).toBeLessThan(bigSource.length);
    expect(ctx.code.source).toContain("truncated");
  });
});
