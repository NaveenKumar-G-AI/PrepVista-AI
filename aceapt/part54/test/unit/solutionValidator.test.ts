import { describe, it, expect } from "vitest";
import { SolutionValidator } from "../../src/validators/SolutionValidator.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import { upstreamThroughAnswer, withValidator } from "../fixtures/runChain.js";

describe("SolutionValidator", () => {
  const validator = new SolutionValidator();

  it("PASSes when the solution agrees with the declared answer", async () => {
    const snapshot = baselineSnapshot();
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
    expect(result.evidence.finalAnswerNumeric).toBe(100);
  });

  it("FAILs with SOLUTION_MISMATCH when the solution's conclusion disagrees with the declared answer (spec §37 flagship example: declared 20%, solution computes 25%)", async () => {
    // Declared answer stays 100 (20% of 500) but the solution concludes 125 (as
    // if computing 25% of 500) — the exact defect the spec opens with.
    const snapshot = baselineSnapshot({
      solution: {
        finalAnswer: 125,
        finalExpression: "500 * 0.25",
        steps: [{ id: "s1", order: 1, text: "25% of 500", expression: "500 * 0.25", expectedValue: 125 }]
      }
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("SOLUTION_MISMATCH");
    expect(result.severity).toBe("CRITICAL");
    expect(result.evidence.solutionFinalAnswer).toBe(125);
    expect(result.evidence.declaredAnswer).toBe(100);
  });

  it("FAILs with SOLUTION_STEP_INVALID when a step's own arithmetic doesn't hold (spec §38)", async () => {
    const snapshot = baselineSnapshot({
      solution: {
        finalAnswer: 100,
        steps: [{ id: "s1", order: 1, text: "bad step", expression: "500 * 0.20", expectedValue: 999 }]
      }
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("SOLUTION_STEP_INVALID");
  });

  it("FAILs with SOLUTION_UNPARSEABLE when finalExpression cannot be evaluated", async () => {
    const snapshot = baselineSnapshot({ solution: { finalAnswer: 100, finalExpression: "500 * * 0.20", steps: [] } });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("SOLUTION_UNPARSEABLE");
  });

  it("is NOT_APPLICABLE when no solution is attached", () => {
    const snapshot = baselineSnapshot({ solution: undefined });
    expect(validator.isApplicable({ questionVersion: snapshot } as never)).toBe(false);
  });
});
