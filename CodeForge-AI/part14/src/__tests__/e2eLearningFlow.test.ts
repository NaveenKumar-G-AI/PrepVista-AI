import { describe, it, expect } from "vitest";
import { runCoachEngine } from "../engine/coachEngine";
import { buildCoachingContext } from "../context/contextBuilder";
import { compareAttempts } from "../engine/attemptComparison";
import { ScriptedMockProvider } from "../providers/mockProvider";
import { InMemoryTelemetrySink } from "../telemetry/telemetry";
import type { CoachingStateSnapshot, SubmissionHistoryEntry } from "../types";

const baseProblem = {
  id: "p1",
  title: "Last Element",
  statement: "Return true if the array ends with a peak.",
  constraints: [],
  publicExamples: [],
};

describe("end-to-end learning scenario (8/12 -> 10/12 -> 12/12)", () => {
  it("walks the student from a hint through recognized improvement to a success reflection, without ever fabricating a result", async () => {
    const telemetry = new InMemoryTelemetrySink();
    let state: CoachingStateSnapshot = {
      sessionId: "s1",
      coachingDepth: 1,
      previousHints: [],
      previousObservations: [],
      unresolvedIssues: [],
      resolvedIssues: [],
    };
    const history: SubmissionHistoryEntry[] = [];

    // --- Attempt 1: 8/12, coach gives a progressive hint ---
    history.push({ submissionId: "sub1", submittedAt: "t1", verdict: "WRONG_ANSWER", testsPassed: 8, testsTotal: 12 });
    const provider1 = new ScriptedMockProvider([
      JSON.stringify({
        response_type: "HINT",
        observation: "Your code runs, but four cases still produce the wrong output.",
        concept: "loop boundaries",
        code_locations: [{ line: 2 }],
        confidence: "MEDIUM",
        coaching_level: 1,
        next_question: "Which index does your loop process last?",
        solution_reveal: false,
      }),
    ]);
    const ctx1 = buildCoachingContext({
      problem: baseProblem,
      code: { language: "python", source: "def solve(a):\n    for i in range(len(a) - 1):\n        pass\n" },
      latestExecution: { executed: true, verdict: "WRONG_ANSWER", publicTestsPassed: 8, publicTestsTotal: 12 },
      history,
      state,
      request: { requestedMode: "HINT" },
      policyMode: "practice",
    });
    const r1 = await runCoachEngine(ctx1, { provider: provider1, telemetry });
    expect(r1.ok).toBe(true);
    expect(r1.response?.response_type).toBe("HINT");
    state = { ...state, previousHints: [...state.previousHints, r1.response!.observation], coachingDepth: 2 };

    // --- Attempt 2: 10/12 — improvement must come from compareAttempts (evidence), never the model ---
    history.push({ submissionId: "sub2", submittedAt: "t2", verdict: "WRONG_ANSWER", testsPassed: 10, testsTotal: 12 });
    const comparison = compareAttempts(history);
    expect(comparison.improved).toBe(true);
    expect(comparison.summary).toContain("8/12 to 10/12");

    const provider2 = new ScriptedMockProvider([
      JSON.stringify({
        response_type: "EXPLANATION",
        observation: "Nice — that fixed the off-by-one at the end of the loop. Two cases still fail; they look related to how empty input is handled.",
        concept: "edge cases",
        code_locations: [],
        confidence: "MEDIUM",
        coaching_level: 2,
        next_question: "What does your function do if the array has zero elements?",
        solution_reveal: false,
      }),
    ]);
    const ctx2 = buildCoachingContext({
      problem: baseProblem,
      code: { language: "python", source: "def solve(a):\n    for i in range(len(a)):\n        pass\n" },
      latestExecution: { executed: true, verdict: "WRONG_ANSWER", publicTestsPassed: 10, publicTestsTotal: 12 },
      history,
      state,
      request: { requestedMode: "EXPLAIN" },
      policyMode: "practice",
    });
    const r2 = await runCoachEngine(ctx2, { provider: provider2, telemetry });
    expect(r2.ok).toBe(true);
    expect(r2.response!.observation).not.toEqual(r1.response!.observation);
    state = { ...state, coachingDepth: 3, resolvedIssues: [...state.resolvedIssues, "loop boundary"] };

    // --- Attempt 3: 12/12 — reflection, not another hint ---
    history.push({ submissionId: "sub3", submittedAt: "t3", verdict: "ACCEPTED", testsPassed: 12, testsTotal: 12 });
    const finalComparison = compareAttempts(history);
    expect(finalComparison.improved).toBe(true);
    expect(finalComparison.summary).toContain("10/12 to 12/12");

    const provider3 = new ScriptedMockProvider([
      JSON.stringify({
        response_type: "REFLECTION",
        observation: "All 12 cases pass now. The fix handled both the boundary and the empty-array case.",
        concept: "edge case coverage",
        code_locations: [],
        confidence: "HIGH",
        coaching_level: 1,
        next_question: "What made you think to check the empty-array case?",
        solution_reveal: false,
      }),
    ]);
    const ctx3 = buildCoachingContext({
      problem: baseProblem,
      code: { language: "python", source: "def solve(a):\n    if not a: return False\n    for i in range(len(a)):\n        pass\n" },
      latestExecution: { executed: true, verdict: "ACCEPTED", publicTestsPassed: 12, publicTestsTotal: 12 },
      history,
      state,
      request: { requestedMode: "GUIDE" },
      policyMode: "practice",
    });
    const r3 = await runCoachEngine(ctx3, { provider: provider3, telemetry });
    expect(r3.ok).toBe(true);
    expect(r3.response?.response_type).toBe("REFLECTION");
    expect(r3.response?.confidence).toBe("HIGH"); // justified: hasExecuted + testsPassed both present

    // Every test count in this flow came from `history`, never from the model.
    expect(history.map((h) => `${h.testsPassed}/${h.testsTotal}`)).toEqual(["8/12", "10/12", "12/12"]);
  });

  it("never lets a specific test-failure claim through when no execution evidence exists", async () => {
    const telemetry = new InMemoryTelemetrySink();
    const provider = new ScriptedMockProvider([
      JSON.stringify({
        response_type: "OBSERVATION",
        observation: "Your code fails on test 3 with a wrong output.", // model hallucinating a fact it can't have
        code_locations: [],
        confidence: "HIGH",
        coaching_level: 1,
        solution_reveal: false,
      }),
    ]);
    const ctx = buildCoachingContext({
      problem: baseProblem,
      code: { language: "python", source: "print(1)" },
      latestExecution: null,
      history: [],
      state: { sessionId: "s1", coachingDepth: 1, previousHints: [], previousObservations: [], unresolvedIssues: [], resolvedIssues: [] },
      request: { requestedMode: "EXPLAIN_ERROR" },
      policyMode: "practice",
    });
    const result = await runCoachEngine(ctx, { provider, telemetry });
    expect(result.response!.observation).not.toMatch(/fails on test 3/);
    expect(result.response!.observation).toMatch(/has not been executed/);
    expect(telemetry.events.some((e) => e.type === "grounding_violation")).toBe(true);
  });

  it("falls back safely without throwing when the provider returns malformed JSON twice in a row", async () => {
    const telemetry = new InMemoryTelemetrySink();
    const provider = new ScriptedMockProvider(["not json at all", "{ still not valid"]);
    const ctx = buildCoachingContext({
      problem: baseProblem,
      code: { language: "python", source: "print(1)" },
      latestExecution: null,
      history: [],
      state: { sessionId: "s1", coachingDepth: 1, previousHints: [], previousObservations: [], unresolvedIssues: [], resolvedIssues: [] },
      request: { requestedMode: "HINT" },
      policyMode: "practice",
    });
    const result = await runCoachEngine(ctx, { provider, telemetry });
    expect(result.ok).toBe(false);
    expect(result.response).toBeDefined();
    expect(telemetry.events.filter((e) => e.type === "validation_failure")).toHaveLength(2);
  });
});
