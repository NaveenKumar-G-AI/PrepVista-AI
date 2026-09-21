import { describe, expect, it } from "vitest";
import { extractDeterministically, resolveWeaknessToDimension } from "../../src/services/deterministicExtractor.js";

describe("deterministicExtractor", () => {
  it("matches the spec's own worked example (Section 13)", () => {
    const result = extractDeterministically(
      "I have a placement test in 20 days and logical reasoning is my weakest area."
    );
    expect(result.goal_type).toBe("PLACEMENT_READINESS");
    expect(result.deadline_days).toBe(20);
    expect(result.student_reported_weakness).toMatch(/logical/i);
  });

  it("captures a reported weakness as-said, never as a verified fact (Section 14)", () => {
    const result = extractDeterministically("I think my logical reasoning is weak.");
    expect(result.student_reported_weakness).toMatch(/logical/i);
    // The extractor has no access to real performance data and must not
    // claim one - this is enforced structurally: ExtractedGoalFields has
    // no field that could represent "objectively weak".
    expect(Object.keys(result)).not.toContain("objectively_weak");
  });

  it("returns nulls rather than a guess for vague input", () => {
    const result = extractDeterministically("I want to improve.");
    expect(result.goal_type).toBeNull();
    expect(result.deadline_days).toBeNull();
    expect(result.student_reported_weakness).toBeNull();
  });

  it("parses weeks and months, not just days", () => {
    expect(extractDeterministically("my exam is in 3 weeks").deadline_days).toBe(21);
    expect(extractDeterministically("about 2 months away").deadline_days).toBe(60);
  });

  it("resolves a free-text weakness to a real capability dimension when possible", () => {
    expect(resolveWeaknessToDimension("logical reasoning")).toBe("logical");
    expect(resolveWeaknessToDimension("quantitative aptitude")).toBe("quant");
    expect(resolveWeaknessToDimension("public speaking")).toBeNull();
    expect(resolveWeaknessToDimension(null)).toBeNull();
  });
});
