import { describe, it, expect } from "vitest";
import { getInterventionType } from "../../src/policy/interventionMapping.js";

describe("§112-118 — error type → intervention mapping", () => {
  it("§112 CONCEPTUAL_ERROR → concept reinforcement", () => {
    expect(getInterventionType("CONCEPTUAL_ERROR")).toBe("CONCEPT_REINFORCEMENT");
  });
  it("§113 STRATEGY_ERROR → strategy precision drill", () => {
    expect(getInterventionType("STRATEGY_ERROR")).toBe("STRATEGY_SELECTION_DRILL");
  });
  it("§114 FORMULA_ERROR → formula recognition/application training", () => {
    expect(getInterventionType("FORMULA_ERROR")).toBe("FORMULA_RECOGNITION_DRILL");
  });
  it("§115 CALCULATION_ERROR → calculation precision training", () => {
    expect(getInterventionType("CALCULATION_ERROR")).toBe("CALCULATION_PRECISION_DRILL");
  });
  it("§116 INTERPRETATION_ERROR → question-understanding training", () => {
    expect(getInterventionType("INTERPRETATION_ERROR")).toBe("QUESTION_UNDERSTANDING_DRILL");
  });
  it("§117 UNIT_ERROR → unit-awareness feedback", () => {
    expect(getInterventionType("UNIT_ERROR")).toBe("UNIT_AWARENESS_FEEDBACK");
  });
  it("§118 LOGIC_ERROR → logic precision training", () => {
    expect(getInterventionType("LOGIC_ERROR")).toBe("REASONING_DRILL");
  });
});
