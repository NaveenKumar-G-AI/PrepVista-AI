import { describe, it, expect } from "vitest";
import { UnitsValidator } from "../../src/validators/UnitsValidator.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import { upstreamThroughAnswer, withValidator } from "../fixtures/runChain.js";

describe("UnitsValidator", () => {
  const validator = new UnitsValidator();

  it("PASSes when declared answer and solution agree after unit conversion (spec §26: 6 hours = 360 minutes)", async () => {
    const snapshot = baselineSnapshot({
      questionText: "A task takes how many hours?",
      answerType: "NUMERIC",
      answer: 6,
      options: undefined,
      units: { expected: "hours", allowEquivalentForms: true },
      solution: { finalAnswer: 360, unitOfFinalAnswer: "minutes", steps: [] },
      derivation: undefined
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
  });

  it("FAILs with UNIT_MISMATCH when the same raw digits are silently in the wrong unit (spec §26 bug pattern)", async () => {
    const snapshot = baselineSnapshot({
      questionText: "A task takes how many hours?",
      answerType: "NUMERIC",
      answer: 360, // should be 6 if truly in hours — but shares digits with the (minutes) solution
      options: undefined,
      units: { expected: "hours", allowEquivalentForms: true },
      solution: { finalAnswer: 360, unitOfFinalAnswer: "minutes", steps: [] },
      derivation: undefined
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("UNIT_MISMATCH");
    expect(result.severity).toBe("HIGH");
  });

  it("FAILs CRITICAL when expected and solution units are entirely different dimensions", async () => {
    const snapshot = baselineSnapshot({
      questionText: "Distance covered?",
      answerType: "NUMERIC",
      answer: 5,
      options: undefined,
      units: { expected: "km", allowEquivalentForms: true },
      solution: { finalAnswer: 5, unitOfFinalAnswer: "hours", steps: [] },
      derivation: undefined
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.severity).toBe("CRITICAL");
  });

  it("is NOT_APPLICABLE when the question has no units contract", () => {
    const snapshot = baselineSnapshot({ units: undefined });
    expect(validator.isApplicable({ questionVersion: snapshot } as never)).toBe(false);
  });
});
