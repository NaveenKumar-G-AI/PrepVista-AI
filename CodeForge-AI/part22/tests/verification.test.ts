import { describe, expect, it } from "vitest";
import { analyzeMinimalChange, detectOverfitting, evaluateRegression, validateRootCauseChain } from "../src/debugging/verification.js";
import type { TestOutcome } from "../src/types.js";

describe("validateRootCauseChain", () => {
  it("rejects a chain with no supporting evidence - this is the anti-fabrication gate", () => {
    const result = validateRootCauseChain({ symptom: "s", location: "l", cause: "c", rootCause: "r", fix: null, supportingEvidence: [] });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("no supporting evidence cited");
  });

  it("rejects a chain with an empty link even if evidence is present", () => {
    const result = validateRootCauseChain({
      symptom: "", location: "l", cause: "c", rootCause: "r", fix: null,
      supportingEvidence: [{ type: "EXPERIMENT", ref: "e1" }]
    });
    expect(result.valid).toBe(false);
    expect(result.errors).toContain("symptom is empty");
  });

  it("accepts a fully-populated chain with at least one evidence item", () => {
    const result = validateRootCauseChain({
      symptom: "wrong output",
      location: "calculateWindow",
      cause: "state inconsistent",
      rootCause: "invariant not restored after pointer moves",
      fix: "update state before continuing",
      supportingEvidence: [{ type: "EXPERIMENT", ref: "e1" }]
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });
});

describe("evaluateRegression", () => {
  const outcome = (id: string, passed: boolean): TestOutcome => ({ testId: id, visible: true, passed });

  it("passes overall only when every category passes", () => {
    const result = evaluateRegression({
      originalFailureOutcome: outcome("orig", true),
      relatedTests: [outcome("r1", true)],
      hiddenTests: [outcome("h1", true)],
      regressionTests: [outcome("g1", true)],
      resourceTests: [outcome("p1", true)]
    });
    expect(result.overallPass).toBe(true);
  });

  it("fails overall if a hidden test fails, even when the original and visible tests pass - this is the whole point of hidden tests", () => {
    const result = evaluateRegression({
      originalFailureOutcome: outcome("orig", true),
      relatedTests: [outcome("r1", true)],
      hiddenTests: [outcome("h1", false)],
      regressionTests: [outcome("g1", true)],
      resourceTests: [outcome("p1", true)]
    });
    expect(result.overallPass).toBe(false);
    expect(result.hiddenTestsPassed).toBe(false);
  });

  it("fails overall if the original failure itself was not fixed", () => {
    const result = evaluateRegression({
      originalFailureOutcome: outcome("orig", false),
      relatedTests: [],
      hiddenTests: [],
      regressionTests: [],
      resourceTests: []
    });
    expect(result.overallPass).toBe(false);
  });
});

describe("detectOverfitting", () => {
  it("flags visible-pass/hidden-fail as the canonical overfitting signature, without accusing", () => {
    const signal = detectOverfitting({
      visibleTests: [{ testId: "v1", visible: true, passed: true }],
      hiddenTests: [{ testId: "h1", visible: false, passed: false }]
    });
    expect(signal.suspected).toBe(true);
    expect(signal.reasons[0]).toMatch(/does not generalize/);
    expect(signal.reasons[0]?.toLowerCase()).not.toMatch(/cheat|fraud/);
  });

  it("does not flag a fix that passes both visible and hidden tests", () => {
    const signal = detectOverfitting({
      visibleTests: [{ testId: "v1", visible: true, passed: true }],
      hiddenTests: [{ testId: "h1", visible: false, passed: true }]
    });
    expect(signal.suspected).toBe(false);
  });

  it("does not flag anything when there are no hidden tests to compare against", () => {
    const signal = detectOverfitting({ visibleTests: [{ testId: "v1", visible: true, passed: true }], hiddenTests: [] });
    expect(signal.suspected).toBe(false);
  });
});

describe("analyzeMinimalChange", () => {
  it("counts added/removed lines between versions", () => {
    const before = "def f(x):\n    return x\n";
    const after = "def f(x):\n    return x + 1\n";
    const diff = analyzeMinimalChange(before, after, "f");
    expect(diff.linesAdded).toBeGreaterThan(0);
    expect(diff.linesRemoved).toBeGreaterThan(0);
  });

  it("reports zero added/removed lines for identical code", () => {
    const code = "def f(x):\n    return x\n";
    const diff = analyzeMinimalChange(code, code, "f");
    expect(diff.linesAdded).toBe(0);
    expect(diff.linesRemoved).toBe(0);
  });
});
