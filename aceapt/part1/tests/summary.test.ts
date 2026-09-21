import { describe, it, expect } from "vitest";
import { buildDeterministicSummary } from "@/lib/onboarding/summary";
import { emptyContext, type StudentOnboardingContext } from "@/lib/onboarding/types";

function ctxWith(overrides: Partial<StudentOnboardingContext>): StudentOnboardingContext {
  return { ...emptyContext("test-student"), ...overrides };
}

describe("buildDeterministicSummary", () => {
  it("returns an honest placeholder when nothing has been answered yet", () => {
    const text = buildDeterministicSummary(emptyContext("student-1"));
    expect(text).toMatch(/don't have enough information/i);
  });

  it("only mentions facts that were actually supplied", () => {
    const ctx = ctxWith({ preparationGoal: "CAMPUS_PLACEMENT" });
    const text = buildDeterministicSummary(ctx);
    expect(text).toContain("Campus Placement");
    // nothing about availability, objective, pain points etc. was supplied
    expect(text).not.toMatch(/stuck/i);
    expect(text).not.toMatch(/challenge you flagged/i);
  });

  it("uses the computed day count rather than the raw timeline category when both exist", () => {
    const ctx = ctxWith({
      preparationGoal: "CAMPUS_PLACEMENT",
      timelineCategory: "WITHIN_1_MONTH",
      daysAvailable: 27,
    });
    const text = buildDeterministicSummary(ctx);
    expect(text).toContain("27 days");
  });

  it("never claims strength or weakness — it only ever echoes the student's own words", () => {
    const ctx = ctxWith({
      preparationGoal: "CAMPUS_PLACEMENT",
      experienceLevel: "ALREADY_STRONG",
      selfPerceivedConfidence: { quantitative: "VERY_STRONG", logical: "LOW", verbal: "MODERATE", timePressure: "LOW" },
    });
    const text = buildDeterministicSummary(ctx);
    // The word "strong" may appear only inside a quoted echo of the student's own selection,
    // never as an unqualified claim like "You are strong at quantitative".
    expect(text).not.toMatch(/you are strong/i);
    expect(text).not.toMatch(/you're weak/i);
  });

  it("always closes with the self-perception vs. measured-capability distinction once any content exists", () => {
    const ctx = ctxWith({ preparationGoal: "GENERAL_IMPROVEMENT" });
    const text = buildDeterministicSummary(ctx);
    expect(text).toMatch(/diagnostic will show what you can actually do/i);
  });

  it("respects an OTHER goal with free text instead of the raw enum label", () => {
    const ctx = ctxWith({ preparationGoal: "OTHER", preparationGoalOther: "a state government exam" });
    const text = buildDeterministicSummary(ctx);
    expect(text).toContain("a state government exam");
    expect(text).not.toContain("OTHER");
  });

  it("combines primary and secondary objectives into one readable sentence", () => {
    const ctx = ctxWith({
      primaryObjective: "BECOME_FASTER",
      secondaryObjectives: ["FIX_WEAK_TOPICS"],
    });
    const text = buildDeterministicSummary(ctx);
    expect(text).toMatch(/become faster/i);
    expect(text).toMatch(/fix your weak topics/i);
  });
});
