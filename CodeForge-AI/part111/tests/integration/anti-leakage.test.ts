import { describe, it, expect } from "vitest";
import { toSafeResult } from "../../lib/engine/safe-result";
import { aggregateResults } from "../../lib/engine/scoring";
import type { EvaluationPolicy, TestOutcome } from "../../lib/engine/types";

// Secret-shaped strings that must NEVER appear in a SafeResult, no matter
// what internal fields carried them. Deliberately includes things that
// look like real hidden payloads, checker source, and reference-solution
// source — the kind of content a careless serializer would leak.
const FORBIDDEN_SUBSTRINGS = [
  "SECRET_HIDDEN_INPUT_4471",
  "150000 823917423",
  "def reference_solution(",
  "checker_secret_token_xyz",
  "the array must contain exactly one negative prime",
  "internal-note-should-never-leak",
  "GH-142",
];

function outcomeWithSecrets(overrides: Partial<TestOutcome>): TestOutcome {
  return {
    testCaseId: "SECRET_HIDDEN_INPUT_4471",
    category: "adversarial",
    weight: 3,
    isPublic: false,
    verdict: "WRONG_ANSWER",
    execTimeMs: 42,
    memoryKb: 1000,
    outputSizeBytes: 10,
    exitCode: 1,
    internalNote:
      "internal-note-should-never-leak: expected '150000 823917423' from def reference_solution( using checker_secret_token_xyz " +
      "(the array must contain exactly one negative prime) — regression GH-142",
    ...overrides,
  };
}

const ALL_MODES: EvaluationPolicy["assessmentMode"][] = ["learning", "practice", "assessment", "interview"];

describe("anti-leakage: toSafeResult never exposes internal fields", () => {
  for (const mode of ALL_MODES) {
    it(`mode=${mode}: no forbidden substring appears anywhere in the serialized result`, () => {
      const policy: EvaluationPolicy = { earlyTermination: "none", criticalCategories: [], assessmentMode: mode };
      const outcomes = [
        outcomeWithSecrets({ verdict: "WRONG_ANSWER", category: "adversarial" }),
        outcomeWithSecrets({ verdict: "ACCEPTED", category: "boundary", testCaseId: "another-secret-id" }),
        outcomeWithSecrets({ verdict: "TIME_LIMIT_EXCEEDED", category: "performance" }),
      ];
      const result = aggregateResults(outcomes, policy);
      const safe = toSafeResult("sub-123", "completed", result, policy);
      const serialized = JSON.stringify(safe);

      for (const forbidden of FORBIDDEN_SUBSTRINGS) {
        expect(serialized).not.toContain(forbidden);
      }
      // testCaseId (a stand-in for hidden test identity) must never leak either
      expect(serialized).not.toContain("SECRET_HIDDEN_INPUT_4471");
      expect(serialized).not.toContain("another-secret-id");
    });
  }

  it("interview mode additionally withholds score and category counts entirely", () => {
    const policy: EvaluationPolicy = { earlyTermination: "none", criticalCategories: [], assessmentMode: "interview" };
    const outcomes = [outcomeWithSecrets({ verdict: "WRONG_ANSWER" })];
    const result = aggregateResults(outcomes, policy);
    const safe = toSafeResult("sub-1", "completed", result, policy);
    expect(safe.score).toBeUndefined();
    expect(safe.hiddenCategoryResults).toBeUndefined();
  });

  it("assessment mode withholds the category breakdown but still reports a trustworthy score", () => {
    const policy: EvaluationPolicy = { earlyTermination: "none", criticalCategories: [], assessmentMode: "assessment" };
    const outcomes = [outcomeWithSecrets({ verdict: "ACCEPTED" }), outcomeWithSecrets({ verdict: "WRONG_ANSWER" })];
    const result = aggregateResults(outcomes, policy);
    const safe = toSafeResult("sub-1", "completed", result, policy);
    expect(safe.score).toBeDefined();
    expect(safe.hiddenCategoryResults).toBeUndefined();
  });

  it("learning mode returns real category counts but still never leaks note/id content", () => {
    const policy: EvaluationPolicy = { earlyTermination: "none", criticalCategories: [], assessmentMode: "learning" };
    const outcomes = [outcomeWithSecrets({ verdict: "WRONG_ANSWER", category: "adversarial" })];
    const result = aggregateResults(outcomes, policy);
    const safe = toSafeResult("sub-1", "completed", result, policy);
    expect(safe.hiddenCategoryResults?.adversarial).toEqual({ passed: 0, total: 1 });
    expect(JSON.stringify(safe)).not.toContain("SECRET_HIDDEN_INPUT_4471");
  });

  it("a pending (null) result never fabricates a verdict", () => {
    const policy: EvaluationPolicy = { earlyTermination: "none", criticalCategories: [], assessmentMode: "practice" };
    const safe = toSafeResult("sub-1", "running", null, policy);
    expect(safe.overallVerdict).toBe("PENDING");
    expect(safe.score).toBeUndefined();
  });
});
