import { describe, it, expect } from "vitest";
import { createRegistry } from "../../src/registry/bootstrap.js";
import { buildExecutionPlan } from "../../src/planner/ValidationPlanner.js";

describe("ValidationPlanner", () => {
  const registry = createRegistry();

  it("automatically pulls in transitive dependencies the caller didn't ask for", () => {
    const plan = buildExecutionPlan(registry, ["ASSESSMENT_COMPATIBILITY_VALIDATOR"]);
    expect(plan.allNames).toContain("SCHEMA_VALIDATOR");
    expect(plan.allNames).toContain("ANSWER_VALIDATOR");
    expect(plan.allNames).toContain("OPTIONS_VALIDATOR");
  });

  it("puts SCHEMA_VALIDATOR in the first layer alone", () => {
    const plan = buildExecutionPlan(registry, ["MATH_VALIDATOR"]);
    expect(plan.layers[0]).toContain("SCHEMA_VALIDATOR");
  });

  it("places mutually-independent validators in the same layer for parallel execution", () => {
    const plan2 = buildExecutionPlan(registry, ["MATH_VALIDATOR", "OPTIONS_VALIDATOR", "SOLUTION_VALIDATOR", "UNITS_VALIDATOR"]);
    const mathLayerIndex = plan2.layers.findIndex((l) => l.includes("MATH_VALIDATOR"));
    const optionsLayerIndex = plan2.layers.findIndex((l) => l.includes("OPTIONS_VALIDATOR"));
    expect(mathLayerIndex).toBe(optionsLayerIndex);
  });

  it("throws on an unknown validator name", () => {
    expect(() => buildExecutionPlan(registry, ["NOT_A_REAL_VALIDATOR"])).toThrow(/unknown validator/i);
  });

  it("every validator name in the registry can be planned without error", () => {
    expect(() => buildExecutionPlan(registry, registry.names())).not.toThrow();
  });
});
