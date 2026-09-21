import { describe, it, expect } from "vitest";
import { MathValidator } from "../../src/validators/MathValidator.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import { upstreamThroughAnswer, withValidator } from "../fixtures/runChain.js";

describe("MathValidator", () => {
  const validator = new MathValidator();

  it("PASSes when the declared answer agrees with an independent derivation", async () => {
    const snapshot = baselineSnapshot(); // 20% of 500 = 100, declared 100
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
    expect(result.evidence.derivedAnswer).toBe(100);
  });

  it("CRITICAL FAILs on the spec's flagship example: declared 125 when 20% of 500 is actually 100 (spec §3, §94)", async () => {
    const snapshot = baselineSnapshot({
      answer: "opt_d125",
      options: [
        { id: "opt_a", text: "80", numericValue: 80 },
        { id: "opt_b", text: "100", numericValue: 100 },
        { id: "opt_d125", text: "125", numericValue: 125 }
      ]
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("MATH_INVALID");
    expect(result.severity).toBe("CRITICAL");
    expect(result.evidence.declaredAnswer).toBe(125);
    expect(result.evidence.derivedAnswer).toBe(100);
  });

  it("CRITICAL FAILs on the spec's arithmetic example: 48 × 25 stored as 1400 instead of 1200 (spec §42)", async () => {
    const snapshot = baselineSnapshot({
      questionText: "What is 48 × 25?",
      answerType: "NUMERIC",
      answer: 1400,
      options: undefined,
      solution: undefined,
      derivation: { domain: "ARITHMETIC", expression: "48 * 25" }
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("MATH_INVALID");
    expect(result.evidence.derivedAnswer).toBe(1200);
  });

  it("flags MULTI_SOURCE_DISAGREEMENT when declared+derived agree but an upstream SOLUTION_VALIDATOR pass carries a different value (spec §41)", async () => {
    const snapshot = baselineSnapshot({ solution: undefined }); // isolate MathValidator from SolutionValidator's own (correct) mismatch check
    const upstream = await upstreamThroughAnswer(snapshot);
    upstream.set("SOLUTION_VALIDATOR", {
      validator: "SOLUTION_VALIDATOR",
      category: "SOLUTION",
      status: "PASS",
      severity: "NONE",
      code: "VALID",
      message: "fabricated for isolation",
      evidence: { finalAnswerNumeric: 999 },
      validatorVersion: "1.0.0",
      validatedAt: new Date().toISOString(),
      durationMs: 0
    });
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS_WITH_WARNING");
    expect(result.code).toBe("MULTI_SOURCE_DISAGREEMENT");
    expect(result.severity).toBe("HIGH");
  });

  it("evaluates geometry formulas deterministically (rectangleArea)", async () => {
    const snapshot = baselineSnapshot({
      questionText: "Area of a 5x4 rectangle?",
      answerType: "NUMERIC",
      answer: 20,
      options: undefined,
      solution: undefined,
      derivation: { domain: "GEOMETRY", formula: { name: "rectangleArea", inputs: { length: 5, width: 4 } } }
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
  });

  it("flags an out-of-range probability as CRITICAL MATH_INVALID (spec §45)", async () => {
    const snapshot = baselineSnapshot({
      questionText: "Probability of drawing a red ball?",
      answerType: "DECIMAL",
      answer: 1.4,
      options: undefined,
      solution: undefined,
      derivation: { domain: "PROBABILITY", probability: { favorable: 7, total: 5 } } // malformed input, >1
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("MATH_INVALID");
  });

  it("computes percentageChange over a data-interpretation table (spec §46)", async () => {
    const snapshot = baselineSnapshot({
      questionText: "Percent change in revenue from Q1 to Q2?",
      answerType: "DECIMAL",
      answer: 50,
      options: undefined,
      solution: undefined,
      derivation: { domain: "DATA_INTERPRETATION", dataInterpretation: { table: [[200, 300]], operation: "percentageChange", args: [0, 0, 0, 1] } }
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
  });

  it("is NOT_APPLICABLE when there is no derivation spec at all", () => {
    const snapshot = baselineSnapshot({ derivation: undefined });
    expect(validator.isApplicable({ questionVersion: snapshot } as never)).toBe(false);
  });

  it("is SKIPPED (not FAIL) when the answer type has no comparable numeric value", async () => {
    const snapshot = baselineSnapshot({
      answerType: "TEXT",
      answer: "twenty percent",
      options: undefined,
      derivation: { domain: "PERCENTAGE", expression: "500 * 0.20" }
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("SKIPPED");
  });
});
