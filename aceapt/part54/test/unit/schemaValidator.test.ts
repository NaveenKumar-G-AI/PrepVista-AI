import { describe, it, expect } from "vitest";
import { SchemaValidator } from "../../src/validators/SchemaValidator.js";
import { baselineSnapshot, makeInput } from "../fixtures/baseline.js";

describe("SchemaValidator", () => {
  const validator = new SchemaValidator();

  it("PASSes a well-formed question version", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
    expect(result.code).toBe("VALID");
  });

  it("FAILs when a required field is missing (spec §190)", async () => {
    const snapshot = baselineSnapshot({ questionText: "" });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.severity).toBe("CRITICAL");
  });

  it("FAILs on an invalid enum value for answerType", async () => {
    const snapshot = baselineSnapshot({ answerType: "NOT_A_REAL_TYPE" as never });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("SCHEMA_INVALID_ENUM");
  });

  it("FAILs on an invalid difficulty band", async () => {
    const snapshot = baselineSnapshot({ difficulty: { band: "IMPOSSIBLE" as never, numericValue: 0.5 } });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
  });

  it("is applicable to every question", () => {
    expect(validator.isApplicable()).toBe(true);
  });
});
