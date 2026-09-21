import { describe, it, expect } from "vitest";
import { aggregateResults, shouldStopEarly } from "../../lib/engine/scoring";
import type { EvaluationPolicy, TestOutcome } from "../../lib/engine/types";

function outcome(partial: Partial<TestOutcome>): TestOutcome {
  return {
    testCaseId: "t1",
    category: "basic",
    weight: 1,
    isPublic: false,
    verdict: "ACCEPTED",
    execTimeMs: 10,
    memoryKb: null,
    outputSizeBytes: 2,
    exitCode: 0,
    internalNote: "",
    ...partial,
  };
}

const policy: EvaluationPolicy = { earlyTermination: "none", criticalCategories: [], assessmentMode: "practice" };

describe("aggregateResults", () => {
  it("gives full score when every hidden test passes", () => {
    const r = aggregateResults(
      [outcome({ weight: 1 }), outcome({ weight: 2 }), outcome({ weight: 1, isPublic: true, verdict: "ACCEPTED" })],
      policy
    );
    expect(r.overallVerdict).toBe("ACCEPTED");
    expect(r.score).toBe(100);
  });

  it("computes a proportional weighted score for partial credit", () => {
    const r = aggregateResults(
      [
        outcome({ weight: 1, verdict: "ACCEPTED" }),
        outcome({ weight: 3, verdict: "WRONG_ANSWER" }),
      ],
      policy
    );
    expect(r.score).toBeCloseTo(25, 5); // 1 of 4 weight units
    expect(r.overallVerdict).toBe("WRONG_ANSWER");
  });

  it("never lets an infrastructure failure register as a student-fault verdict", () => {
    const r = aggregateResults(
      [outcome({ verdict: "ACCEPTED" }), outcome({ verdict: "JUDGE_ERROR" }), outcome({ verdict: "ACCEPTED" })],
      policy
    );
    expect(r.overallVerdict).toBe("JUDGE_ERROR");
  });

  it("SYSTEM_ERROR anywhere overrides an otherwise-passing run", () => {
    const r = aggregateResults([outcome({ verdict: "ACCEPTED" }), outcome({ verdict: "SYSTEM_ERROR" })], policy);
    expect(r.overallVerdict).toBe("SYSTEM_ERROR");
  });

  it("is deterministic: identical outcome sets always aggregate identically", () => {
    const outcomes = [
      outcome({ weight: 2, verdict: "ACCEPTED" }),
      outcome({ weight: 1, verdict: "TIME_LIMIT_EXCEEDED" }),
      outcome({ weight: 1, verdict: "WRONG_ANSWER" }),
    ];
    const a = aggregateResults(outcomes, policy);
    const b = aggregateResults(outcomes, policy);
    expect(a).toEqual(b);
  });

  it("excludes public tests from the score denominator", () => {
    const r = aggregateResults(
      [outcome({ isPublic: true, weight: 100, verdict: "WRONG_ANSWER" }), outcome({ weight: 1, verdict: "ACCEPTED" })],
      policy
    );
    expect(r.score).toBe(100); // the failing public test must not drag down the hidden-weighted score
  });
});

describe("shouldStopEarly", () => {
  it("never stops when policy is 'none'", () => {
    const outcomes = [outcome({ verdict: "WRONG_ANSWER", category: "adversarial" })];
    expect(shouldStopEarly(outcomes, { ...policy, earlyTermination: "none" })).toBe(false);
  });

  it("stops after a critical-category failure when configured", () => {
    const outcomes = [outcome({ verdict: "WRONG_ANSWER", category: "adversarial" })];
    expect(
      shouldStopEarly(outcomes, {
        ...policy,
        earlyTermination: "stop_on_first_critical_failure",
        criticalCategories: ["adversarial"],
      })
    ).toBe(true);
  });

  it("does NOT stop on a non-critical category failure", () => {
    const outcomes = [outcome({ verdict: "WRONG_ANSWER", category: "basic" })];
    expect(
      shouldStopEarly(outcomes, {
        ...policy,
        earlyTermination: "stop_on_first_critical_failure",
        criticalCategories: ["adversarial"],
      })
    ).toBe(false);
  });

  it("never stops on a judge error - always keep gathering full diagnostics", () => {
    const outcomes = [outcome({ verdict: "JUDGE_ERROR", category: "adversarial" })];
    expect(
      shouldStopEarly(outcomes, {
        ...policy,
        earlyTermination: "stop_on_first_critical_failure",
        criticalCategories: ["adversarial"],
      })
    ).toBe(false);
  });
});
