import { describe, it, expect } from "vitest";
import { SkillValidator } from "../../src/validators/SkillValidator.js";
import { baselineSnapshot, makeInput } from "../fixtures/baseline.js";

describe("SkillValidator", () => {
  const validator = new SkillValidator();

  it("PASSes when the primary skill resolves and matches the computed domain", async () => {
    const result = await validator.validate(makeInput(baselineSnapshot()));
    expect(result.status).toBe("PASS");
  });

  it("FAILs with SKILL_UNRESOLVABLE when the primary skill id doesn't exist in the skill graph", async () => {
    const snapshot = baselineSnapshot({ skill: { primarySkillId: "skill.does_not_exist", secondarySkillIds: [] } });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("SKILL_UNRESOLVABLE");
    expect(result.severity).toBe("CRITICAL");
  });

  it("flags SKILL_MISMATCH as a warning when tagged skill doesn't match the computed domain (spec §52 example: tagged Probability, actually permutation)", async () => {
    // Skill graph only knows "skill.percentage" with a percentage-flavored signature
    // (see test fixtures) — tag the question with that skill but give it a
    // permutation/combination derivation domain to force a mismatch.
    const snapshot = baselineSnapshot({ derivation: { domain: "PERMUTATION_COMBINATION", expression: "combinations(5,2)" }, answer: "opt_b" });
    const result = await validator.validate(makeInput(snapshot));
    expect(result.status).toBe("PASS_WITH_WARNING");
    expect(result.code).toBe("SKILL_MISMATCH");
    expect(result.severity).toBe("MEDIUM");
  });

  it("is applicable to every question", () => {
    expect(validator.isApplicable()).toBe(true);
  });
});
