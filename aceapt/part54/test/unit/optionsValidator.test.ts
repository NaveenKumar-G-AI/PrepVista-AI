import { describe, it, expect } from "vitest";
import { OptionsValidator } from "../../src/validators/OptionsValidator.js";
import { baselineSnapshot } from "../fixtures/baseline.js";
import { upstreamThroughAnswer, withValidator } from "../fixtures/runChain.js";

describe("OptionsValidator", () => {
  const validator = new OptionsValidator();

  it("PASSes well-formed options with exactly one correct answer", async () => {
    const snapshot = baselineSnapshot();
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
  });

  it("FAILs with NO_VALID_OPTION even if upstream evidence is stale/inconsistent (spec §32 — never trust upstream blindly)", async () => {
    // In the real dependency-gated pipeline this can't happen (ANSWER_VALIDATOR
    // already guarantees resolution before OPTIONS_VALIDATOR is even allowed to
    // run) — this test proves OptionsValidator re-verifies independently rather
    // than trusting a fabricated/stale upstream result at face value.
    const snapshot = baselineSnapshot();
    const staleUpstream = new Map([
      [
        "ANSWER_VALIDATOR",
        {
          validator: "ANSWER_VALIDATOR",
          category: "ANSWER" as const,
          status: "PASS" as const,
          severity: "NONE" as const,
          code: "VALID" as const,
          message: "stale",
          evidence: { normalizedAnswer: "opt_does_not_exist" },
          validatorVersion: "1.0.0",
          validatedAt: new Date().toISOString(),
          durationMs: 0
        }
      ]
    ]);
    const result = await withValidator(validator, snapshot, staleUpstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("NO_VALID_OPTION");
    expect(result.severity).toBe("CRITICAL");
  });

  it("FAILs with OPTION_STRUCTURE_INVALID when fewer than 2 options exist", async () => {
    const snapshot = baselineSnapshot({ options: [{ id: "opt_a", text: "Only one" }] });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("OPTION_STRUCTURE_INVALID");
  });

  it("FAILs with MULTIPLE_VALID_OPTIONS when a distractor is numerically equivalent to the correct answer (spec §30, §34)", async () => {
    // Correct answer is opt_b = 100. Add opt_e which is ALSO 100 (e.g. "1/1 * 100").
    const snapshot = baselineSnapshot({
      options: [
        { id: "opt_a", text: "80", numericValue: 80 },
        { id: "opt_b", text: "100", numericValue: 100 },
        { id: "opt_c", text: "120", numericValue: 120 },
        { id: "opt_e", text: "100.0", numericValue: 100 }
      ]
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("FAIL");
    expect(result.code).toBe("MULTIPLE_VALID_OPTIONS");
    expect(result.severity).toBe("HIGH");
  });

  it("flags DUPLICATE_OPTION as a warning when two WRONG options coincide (spec §33 exact example: 25/30/25/40)", async () => {
    const snapshot = baselineSnapshot({
      answer: "opt_b",
      options: [
        { id: "opt_a", text: "25", numericValue: 25 },
        { id: "opt_b", text: "30", numericValue: 30 },
        { id: "opt_c", text: "25 again", numericValue: 25 },
        { id: "opt_d", text: "40", numericValue: 40 }
      ]
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS_WITH_WARNING");
    expect(result.code).toBe("DUPLICATE_OPTION");
    expect(result.severity).toBe("MEDIUM");
  });

  it("is NOT_APPLICABLE to non-select answer types", () => {
    const snapshot = baselineSnapshot({ answerType: "NUMERIC", options: undefined });
    expect(validator.isApplicable({ questionVersion: snapshot } as never)).toBe(false);
  });

  it("does not flag legitimate multiple correct answers for MULTI_SELECT (spec §31)", async () => {
    const snapshot = baselineSnapshot({
      answerType: "MULTI_SELECT",
      answer: ["opt_a", "opt_c"],
      options: [
        { id: "opt_a", text: "A", numericValue: 1 },
        { id: "opt_b", text: "B", numericValue: 2 },
        { id: "opt_c", text: "C", numericValue: 3 }
      ]
    });
    const upstream = await upstreamThroughAnswer(snapshot);
    const result = await withValidator(validator, snapshot, upstream);
    expect(result.status).toBe("PASS");
  });
});
