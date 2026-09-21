import { describe, it, expect } from "vitest";
import { AnswerValidator } from "../../src/validators/AnswerValidator.js";
import { baselineSnapshot, makeInput } from "../fixtures/baseline.js";

describe("AnswerValidator", () => {
  const validator = new AnswerValidator();

  it("PASSes a well-formed SINGLE_SELECT answer and records its numeric value", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
    expect(result.evidence.numericValue).toBe(100);
  });

  it("FAILs when no answer is declared", async () => {
    const snapshot = baselineSnapshot({ answer: "" });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("ANSWER_STRUCTURE_INVALID");
    expect(result.severity).toBe("CRITICAL");
  });

  it("FAILs when the declared answer references a non-existent option id (spec §191)", async () => {
    const snapshot = baselineSnapshot({ answer: "opt_z" });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("ANSWER_UNRESOLVABLE_ID");
  });

  it("FAILs when a numeric answer can't be parsed at all", async () => {
    const snapshot = baselineSnapshot({ answerType: "NUMERIC", answer: "not-a-number", options: undefined });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("ANSWER_NOT_NORMALIZABLE");
  });

  it("extracts fraction and percentage literals correctly for NUMERIC-family types", async () => {
    const half = await validator.validate(makeInput(baselineSnapshot({ answerType: "FRACTION", answer: "1/2", options: undefined })));
    expect(half.evidence.numericValue).toBeCloseTo(0.5);

    const pct = await validator.validate(makeInput(baselineSnapshot({ answerType: "PERCENTAGE", answer: "50%", options: undefined })));
    expect(pct.evidence.numericValue).toBeCloseTo(0.5);
    expect(pct.evidence.wasPercentageLiteral).toBe(true);
  });

  it("normalizes MULTI_SELECT answers and sorts them for stable comparison", async () => {
    const snapshot = baselineSnapshot({
      answerType: "MULTI_SELECT",
      answer: ["opt_b", "opt_a"],
      options: [
        { id: "opt_a", text: "A" },
        { id: "opt_b", text: "B" },
        { id: "opt_c", text: "C" }
      ]
    });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("PASS");
    expect(result.evidence.normalizedAnswer).toEqual(["opt_a", "opt_b"]);
  });
});
