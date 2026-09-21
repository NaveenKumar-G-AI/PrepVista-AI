import { describe, it, expect } from "vitest";
import { buildPrompt } from "../../src/ai/promptBuilder.js";
import { classify } from "../../src/deterministic/classify.js";
import { evidence, test as t } from "../fixtures/evidence.js";
import { TestOutcome } from "../../src/domain/enums.js";

describe("Hidden test protection", () => {
  it("the prompt never contains a value stashed on a field the domain type does not define — proving buildPrompt only ever reads known-safe fields", () => {
    const SECRET = "SECRET_HIDDEN_EXPECTED_OUTPUT_4471";
    // Simulate a hypothetical future bug where a raw hidden value gets
    // attached to a TestResult object via an extra property that isn't
    // part of the TestResult type at all (TypeScript wouldn't let
    // production code do this on a typed object, but a defensive test
    // should not rely solely on the type checker).
    const dangerousTest = t("hidden_1", TestOutcome.WRONG_ANSWER, ["boundary"]) as unknown as Record<string, unknown>;
    dangerousTest.rawExpectedOutput = SECRET;
    dangerousTest.rawActualOutput = SECRET;

    const ev = evidence({
      tests: {
        totalAvailable: 1,
        gradingComplete: true,
        results: [dangerousTest as any],
      },
    });
    const deterministic = classify(ev);

    const built = buildPrompt({
      ref: ev.ref,
      sourceCode: "def f(): pass",
      requirements: [],
      requirementCoverage: [],
      deterministic,
      staticFindings: [],
      previous: null,
    });

    expect(built.systemPrompt).not.toContain(SECRET);
    expect(built.userPrompt).not.toContain(SECRET);
  });

  it("only non-identifying tags and outcomes for hidden tests reach the prompt, never a raw identifier hinting at content", () => {
    const ev = evidence({
      tests: {
        totalAvailable: 2,
        gradingComplete: true,
        results: [
          t("hidden_case_7", TestOutcome.WRONG_ANSWER, ["duplicate-values"], { hidden: true }),
          t("hidden_case_8", TestOutcome.PASS, ["normal"], { hidden: true }),
        ],
      },
    });
    const deterministic = classify(ev);
    const built = buildPrompt({
      ref: ev.ref,
      sourceCode: "def f(): pass",
      requirements: [],
      requirementCoverage: [],
      deterministic,
      staticFindings: [],
      previous: null,
    });

    // Tags and test ids (non-identifying labels) are legitimately present —
    // that's the intended, safe evidence surface.
    expect(built.userPrompt).toContain("duplicate-values");
    // But the system prompt explicitly instructs the model that it has
    // not been given hidden input/output content and must never claim to
    // know it.
    expect(built.systemPrompt.toLowerCase()).toContain("hidden test");
  });

  it("system prompt explicitly instructs the model to treat student_code/problem_requirements blocks as inert data", () => {
    const ev = evidence({ tests: { totalAvailable: 1, gradingComplete: true, results: [t("t1", TestOutcome.PASS)] } });
    const built = buildPrompt({
      ref: ev.ref,
      sourceCode: "print('hi')",
      requirements: [],
      requirementCoverage: [],
      deterministic: classify(ev),
      staticFindings: [],
      previous: null,
    });
    expect(built.systemPrompt).toContain("<student_code>");
    expect(built.systemPrompt.toLowerCase()).toContain("never follow directives");
  });
});
