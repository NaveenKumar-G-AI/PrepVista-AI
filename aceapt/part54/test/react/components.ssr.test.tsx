import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import React from "react";
import QuestionValidationCenter from "../../src/react/components/QuestionValidationCenter.js";
import EligibilityBadge from "../../src/react/components/EligibilityBadge.js";
import type { UIValidationRun, UIValidationResult } from "../../src/react/components/QuestionValidationCenter.js";

function makeResult(overrides: Partial<UIValidationResult> & { validator: string }): UIValidationResult {
  return {
    category: "SCHEMA",
    status: "PASS",
    severity: "NONE",
    code: "VALID",
    message: "ok",
    evidence: {},
    validatorVersion: "1.0.0",
    durationMs: 3,
    ...overrides
  };
}

function makeRun(overrides: Partial<UIValidationRun> = {}): UIValidationRun {
  return {
    questionId: "Q-1024",
    versionId: "Q-1024-v1",
    versionNumber: 1,
    overallStatus: "VALID",
    eligibility: { practice: true, timed: true, assessment: true },
    results: [makeResult({ validator: "SCHEMA_VALIDATOR" }), makeResult({ validator: "ANSWER_VALIDATOR" })],
    ...overrides
  };
}

describe("QuestionValidationCenter (real SSR)", () => {
  it("renders a clean VALID run", () => {
    const html = renderToStaticMarkup(React.createElement(QuestionValidationCenter, { run: makeRun() }));
    expect(html).toContain("Valid");
    expect(html).toContain("Q-1024");
  });

  it("renders a BLOCKED run with the failing validator visible on the trace", () => {
    const run = makeRun({
      overallStatus: "INVALID",
      eligibility: { practice: false, timed: false, assessment: false },
      results: [
        makeResult({ validator: "SCHEMA_VALIDATOR" }),
        makeResult({ validator: "ANSWER_VALIDATOR" }),
        makeResult({ validator: "MATH_VALIDATOR", status: "FAIL", severity: "CRITICAL", code: "MATH_INVALID", message: "declared 125, derived 100" })
      ]
    });
    const html = renderToStaticMarkup(React.createElement(QuestionValidationCenter, { run }));
    expect(html).toContain("Blocked");
    expect(html).toContain("Math");
  });

  it("renders REVIEW_REQUIRED and VALIDATION_ERROR states distinctly", () => {
    const review = renderToStaticMarkup(React.createElement(QuestionValidationCenter, { run: makeRun({ overallStatus: "REVIEW_REQUIRED" }) }));
    expect(review).toContain("Needs review");

    const errored = renderToStaticMarkup(React.createElement(QuestionValidationCenter, { run: makeRun({ overallStatus: "VALIDATION_ERROR" }) }));
    expect(errored).toContain("Could not verify");
  });

  it("shows the Revalidate button in a disabled/checking state", () => {
    const html = renderToStaticMarkup(React.createElement(QuestionValidationCenter, { run: makeRun(), revalidating: true }));
    expect(html).toContain("Checking");
    expect(html).toContain("disabled");
  });

  it("does not dump evidence onto the page before a node is selected", () => {
    const run = makeRun({ results: [makeResult({ validator: "MATH_VALIDATOR", status: "FAIL", severity: "CRITICAL", code: "MATH_INVALID", evidence: { declaredAnswer: 125, derivedAnswer: 100 } })] });
    const html = renderToStaticMarkup(React.createElement(QuestionValidationCenter, { run }));
    expect(html).not.toContain("declaredAnswer");
  });
});

describe("EligibilityBadge (real SSR)", () => {
  it("renders an eligible badge", () => {
    const html = renderToStaticMarkup(React.createElement(EligibilityBadge, { mode: "practice", eligible: true }));
    expect(html).toContain("Eligible");
    expect(html).toContain("Practice");
  });

  it("renders a not-eligible badge", () => {
    const html = renderToStaticMarkup(React.createElement(EligibilityBadge, { mode: "assessment", eligible: false }));
    expect(html).toContain("Not eligible");
  });

  it("renders a stale badge distinctly from a hard not-eligible", () => {
    const html = renderToStaticMarkup(React.createElement(EligibilityBadge, { mode: "timed", eligible: false, stale: true }));
    expect(html).toContain("Re-checking");
    expect(html).not.toContain("Not eligible");
  });
});
