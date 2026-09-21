import { describe, it, expect } from "vitest";
import { aggregate } from "../../src/aggregator/ValidationAggregator.js";
import { PRACTICE_PROFILE, ASSESSMENT_PROFILE } from "../../src/profiles/validationProfiles.js";
import type { ValidationResult } from "../../src/contracts/types.js";

function result(overrides: Partial<ValidationResult> & { validator: string }): ValidationResult {
  return {
    category: "SCHEMA",
    status: "PASS",
    severity: "NONE",
    code: "VALID",
    message: "ok",
    evidence: {},
    validatorVersion: "1.0.0",
    validatedAt: new Date().toISOString(),
    durationMs: 1,
    ...overrides
  };
}

describe("ValidationAggregator", () => {
  it("never treats zero results as VALID", () => {
    const out = aggregate([], PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("VALIDATION_ERROR");
  });

  it("is VALID when every required validator PASSes", () => {
    const results = PRACTICE_PROFILE.required.map((name) => result({ validator: name }));
    const out = aggregate(results, PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("VALID");
    expect(out.eligibility.practice).toBe(true);
  });

  it("is INVALID when a REQUIRED validator FAILs at HIGH+ severity", () => {
    const results = PRACTICE_PROFILE.required.map((name) =>
      name === "ANSWER_VALIDATOR" ? result({ validator: name, status: "FAIL", severity: "CRITICAL", code: "ANSWER_MISMATCH" }) : result({ validator: name })
    );
    const out = aggregate(results, PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("INVALID");
    expect(out.blockingCodes).toContain("ANSWER_MISMATCH");
  });

  it("returns only a rollup, never replacing the individual results array", () => {
    const out = aggregate([result({ validator: "X" })], PRACTICE_PROFILE);
    expect(Object.keys(out).sort()).toEqual(["blockingCodes", "eligibility", "highestSeverity", "overallStatus"].sort());
  });

  it("an AI (non-required) validator's genuine REVIEW opinion at HIGH severity pushes to REVIEW_REQUIRED, never to INVALID", () => {
    const results = [
      ...PRACTICE_PROFILE.required.map((name) => result({ validator: name })),
      result({ validator: "AI_SEMANTIC_VALIDATOR", status: "PASS_WITH_WARNING", severity: "HIGH", code: "AI_REVIEW_SUGGESTED" })
    ];
    const out = aggregate(results, PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("REVIEW_REQUIRED");
  });

  it("AI_UNAVAILABLE/AI_OUTPUT_INVALID are infrastructure facts, not content findings — they never move overall status off VALID by themselves", () => {
    const results = [
      ...PRACTICE_PROFILE.required.map((name) => result({ validator: name })),
      result({ validator: "AI_SEMANTIC_VALIDATOR", status: "PASS_WITH_WARNING", severity: "LOW", code: "AI_UNAVAILABLE" })
    ];
    const out = aggregate(results, PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("VALID");
  });

  it("a required validator that never ran at all cannot claim VALID for that profile", () => {
    const partial = PRACTICE_PROFILE.required.slice(0, -1).map((name) => result({ validator: name }));
    const out = aggregate(partial, PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("VALIDATION_ERROR");
  });

  it("computes an independent eligibility matrix per mode from the SAME evidence", () => {
    const results = [...new Set([...PRACTICE_PROFILE.required, ...ASSESSMENT_PROFILE.required])].map((name) =>
      name === "ASSESSMENT_COMPATIBILITY_VALIDATOR" ? result({ validator: name, status: "FAIL", severity: "HIGH", code: "ASSESSMENT_INCOMPATIBLE" }) : result({ validator: name })
    );

    const out = aggregate(results, ASSESSMENT_PROFILE);
    expect(out.eligibility.practice).toBe(true);
    expect(out.eligibility.assessment).toBe(false);
  });

  it("SKIPPED validators don't double-penalize the same root cause", () => {
    const results = [
      result({ validator: "ANSWER_VALIDATOR", status: "FAIL", severity: "CRITICAL", code: "ANSWER_MISMATCH" }),
      result({ validator: "OPTIONS_VALIDATOR", status: "SKIPPED", severity: "NONE", code: "DEPENDENCY_FAILED" }),
      result({ validator: "SCHEMA_VALIDATOR", status: "PASS" }),
      result({ validator: "RUNTIME_VALIDATOR", status: "PASS" }),
      result({ validator: "SCORING_COMPATIBILITY_VALIDATOR", status: "SKIPPED", severity: "NONE", code: "DEPENDENCY_FAILED" })
    ];
    const out = aggregate(results, PRACTICE_PROFILE);
    expect(out.overallStatus).toBe("INVALID");
    expect(out.blockingCodes).toEqual(["ANSWER_MISMATCH"]);
  });
});
