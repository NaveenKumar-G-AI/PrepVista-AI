import { describe, it, expect } from "vitest";
import { stepValueSchemas, isKnownStep } from "@/lib/onboarding/validation";

describe("isKnownStep", () => {
  it("recognizes valid step ids", () => {
    expect(isKnownStep("goal")).toBe(true);
    expect(isKnownStep("confidence-map")).toBe(true);
  });

  it("rejects unknown step ids", () => {
    expect(isKnownStep("not-a-real-step")).toBe(false);
    expect(isKnownStep("summary")).toBe(false); // summary/transition aren't answerable payloads
  });
});

describe("goal schema", () => {
  it("accepts a plain enum selection", () => {
    const result = stepValueSchemas.goal.safeParse({ preparationGoal: "CAMPUS_PLACEMENT" });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid enum value", () => {
    const result = stepValueSchemas.goal.safeParse({ preparationGoal: "TAKE_OVER_THE_WORLD" });
    expect(result.success).toBe(false);
  });

  it("requires free text when OTHER is selected", () => {
    const missing = stepValueSchemas.goal.safeParse({ preparationGoal: "OTHER" });
    expect(missing.success).toBe(false);

    const provided = stepValueSchemas.goal.safeParse({
      preparationGoal: "OTHER",
      preparationGoalOther: "Preparing for a state-level exam",
    });
    expect(provided.success).toBe(true);
  });
});

describe("confidence-map schema", () => {
  it("requires all four dimensions", () => {
    const result = stepValueSchemas["confidence-map"].safeParse({
      quantitative: "MODERATE",
      logical: "LOW",
      verbal: "STRONG",
      // timePressure missing
    });
    expect(result.success).toBe(false);
  });

  it("accepts a complete, valid grid", () => {
    const result = stepValueSchemas["confidence-map"].safeParse({
      quantitative: "MODERATE",
      logical: "LOW",
      verbal: "STRONG",
      timePressure: "DEVELOPING",
    });
    expect(result.success).toBe(true);
  });
});

describe("pain-point schema", () => {
  it("requires a primary pain point", () => {
    const result = stepValueSchemas["pain-point"].safeParse({ secondaryPainPoints: ["TAKE_TOO_LONG"] });
    expect(result.success).toBe(false);
  });

  it("defaults secondary points to an empty array", () => {
    const result = stepValueSchemas["pain-point"].safeParse({ primaryPainPoint: "LOSE_MOTIVATION" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.secondaryPainPoints).toEqual([]);
  });
});

describe("timeline schema", () => {
  it("allows an absent target date", () => {
    const result = stepValueSchemas.timeline.safeParse({ timelineCategory: "NOT_SURE" });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed target date instead of silently accepting it", () => {
    const result = stepValueSchemas.timeline.safeParse({
      timelineCategory: "WITHIN_1_MONTH",
      targetDate: "not-a-date",
    });
    expect(result.success).toBe(false);
  });
});
