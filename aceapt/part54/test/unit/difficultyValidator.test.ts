import { describe, it, expect } from "vitest";
import { DifficultyValidator } from "../../src/validators/DifficultyValidator.js";
import { baselineSnapshot, makeInput } from "../fixtures/baseline.js";

describe("DifficultyValidator", () => {
  const validator = new DifficultyValidator();

  it("PASSes structurally valid difficulty metadata", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
  });

  it("FAILs with DIFFICULTY_METADATA_INVALID when numericValue is outside its band's range", async () => {
    const snapshot = baselineSnapshot({ difficulty: { band: "EASY", numericValue: 0.95 } });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("DIFFICULTY_METADATA_INVALID");
  });

  it("warns DIFFICULTY_IMPLAUSIBLE when EASY is paired with high structural complexity (spec §56)", async () => {
    const snapshot = baselineSnapshot({
      difficulty: { band: "EASY", numericValue: 0.1 },
      solution: {
        finalAnswer: 100,
        steps: Array.from({ length: 8 }, (_, i) => ({ id: `s${i}`, order: i + 1, text: `step ${i}` }))
      },
      options: [
        { id: "a", text: "1" },
        { id: "b", text: "2" },
        { id: "c", text: "3" },
        { id: "d", text: "4" },
        { id: "e", text: "5" },
        { id: "f", text: "6" }
      ],
      answer: "a"
    });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("PASS_WITH_WARNING");
    expect(result.code).toBe("DIFFICULTY_IMPLAUSIBLE");
  });

  it("never produces a bare numeric score — evidence always carries the band and complexity separately", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.evidence).toHaveProperty("band");
    expect(result.evidence).toHaveProperty("complexityScore");
  });
});
