import { describe, expect, it } from "vitest";
import { currentPrompt, evaluateStep, startExperiment } from "../src/domain/misconceptionLab";

describe("misconception contradiction experiment (section 130 worked example)", () => {
  it("walks the student from 100 -> 120 -> 96 -> 'no' -> discovery, resolving the misconception", () => {
    let state = startExperiment(20);
    expect(currentPrompt(state)).toContain("Start with 100");

    let step = evaluateStep(state, "120");
    expect(step.correct).toBe(true);
    state = step.advance;
    expect(state.step).toBe(1);
    expect(currentPrompt(state)).toContain("120");

    step = evaluateStep(state, "96");
    expect(step.correct).toBe(true);
    state = step.advance;
    expect(state.step).toBe(2);

    step = evaluateStep(state, "No");
    expect(step.correct).toBe(true);
    state = step.advance;
    expect(state.step).toBe(3);

    step = evaluateStep(state, "They don't cancel because the base changes.");
    expect(step.resolved).toBe(true);
  });

  it("gives a targeted hint and does not advance on a wrong intermediate answer", () => {
    const state = startExperiment(20);
    const step = evaluateStep(state, "110");
    expect(step.correct).toBe(false);
    expect(step.advance.step).toBe(0); // stays put, does not silently move on
    expect(step.hint).toBeTruthy();
  });

  it("falls back to a default percent when given an invalid one", () => {
    const state = startExperiment(-5);
    expect(state.percent).toBe(20);
  });
});
