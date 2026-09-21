import { describe, it, expect } from "vitest";
import {
  getVisibleSteps,
  getVisibleQuestionSteps,
  getNextStepId,
  getProgress,
  getResumeStepId,
} from "@/lib/onboarding/flow";
import { emptyContext, type StudentOnboardingContext } from "@/lib/onboarding/types";

function ctxWith(overrides: Partial<StudentOnboardingContext>): StudentOnboardingContext {
  return { ...emptyContext("test-student"), ...overrides };
}

describe("branching: previous-difficulties step", () => {
  it("is hidden before previous-preparation is answered", () => {
    const ctx = ctxWith({});
    const ids = getVisibleSteps(ctx).map((s) => s.id);
    expect(ids).not.toContain("previous-difficulties");
  });

  it("is hidden when the student has never prepared before", () => {
    const ctx = ctxWith({ previousPreparation: "NEVER" });
    const ids = getVisibleSteps(ctx).map((s) => s.id);
    expect(ids).not.toContain("previous-difficulties");
  });

  it("appears once the student reports any prior preparation", () => {
    const ctx = ctxWith({ previousPreparation: "OCCASIONALLY" });
    const ids = getVisibleSteps(ctx).map((s) => s.id);
    expect(ids).toContain("previous-difficulties");
  });
});

describe("progress indicator reacts honestly to branching", () => {
  it("total step count grows when a branch becomes visible", () => {
    const without = getProgress("goal", ctxWith({ previousPreparation: "NEVER" }));
    const withBranch = getProgress("goal", ctxWith({ previousPreparation: "REGULARLY" }));
    expect(withBranch.total).toBe(without.total + 1);
  });

  it("current index matches position among visible question steps only (summary/transition excluded)", () => {
    const ctx = ctxWith({});
    const questionSteps = getVisibleQuestionSteps(ctx);
    const lastQuestion = questionSteps[questionSteps.length - 1]!;
    const progress = getProgress(lastQuestion.id, ctx);
    expect(progress.current).toBe(progress.total);
  });
});

describe("getNextStepId", () => {
  it("skips a hidden branch entirely when advancing", () => {
    const ctx = ctxWith({ previousPreparation: "NEVER" });
    const next = getNextStepId("previous-preparation", ctx);
    expect(next).not.toBe("previous-difficulties");
    expect(next).toBe("confidence-map");
  });

  it("routes through a visible branch when applicable", () => {
    const ctx = ctxWith({ previousPreparation: "REGULARLY" });
    const next = getNextStepId("previous-preparation", ctx);
    expect(next).toBe("previous-difficulties");
  });

  it("returns null after the final step", () => {
    const ctx = ctxWith({});
    expect(getNextStepId("diagnostic-intro", ctx)).toBeNull();
  });
});

describe("getResumeStepId", () => {
  it("resumes at the first unanswered required step", () => {
    const ctx = ctxWith({
      preparationGoal: "CAMPUS_PLACEMENT",
      primaryObjective: "IMPROVE_SCORE",
      secondaryObjectives: [],
    });
    expect(getResumeStepId(ctx)).toBe("timeline");
  });

  it("lands on summary once every required step is answered", () => {
    const ctx = ctxWith({
      preparationGoal: "CAMPUS_PLACEMENT",
      primaryObjective: "IMPROVE_SCORE",
      timelineCategory: "WITHIN_1_MONTH",
      experienceLevel: "SOME_CONCEPTS",
      previousPreparation: "NEVER",
      selfPerceivedConfidence: { quantitative: "MODERATE", logical: "LOW", verbal: "MODERATE", timePressure: "LOW" },
      dailyAvailability: "MIN_30",
      primaryPainPoint: "TAKE_TOO_LONG",
    });
    expect(getResumeStepId(ctx)).toBe("summary");
  });

  it("never resumes into a step that is no longer visible", () => {
    // student had previously answered previous-difficulties, then (hypothetically) their
    // previous-preparation answer changed to NEVER via an edit — resume must not send them
    // back into a branch that is now hidden.
    const ctx = ctxWith({
      preparationGoal: "CAMPUS_PLACEMENT",
      primaryObjective: "IMPROVE_SCORE",
      timelineCategory: "WITHIN_1_MONTH",
      experienceLevel: "SOME_CONCEPTS",
      previousPreparation: "NEVER",
      previousDifficulties: ["TIME_PRESSURE"],
    });
    const resumeId = getResumeStepId(ctx);
    expect(resumeId).not.toBe("previous-difficulties");
  });
});
