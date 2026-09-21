import { describe, it, expect } from "vitest";
import { computeSkillSignals } from "../src/domain/skill-signals.js";
import { generatePostmortem } from "../src/domain/postmortem.js";
import {
  DebuggingCoachState,
  DebuggingPhase,
  HypothesisStatus,
  StudentSkillLevel,
  CoachingMode,
  CoachingLevel,
} from "../src/types.js";

function baseState(overrides: Partial<DebuggingCoachState> = {}): DebuggingCoachState {
  return {
    id: "state-1",
    debuggingSessionId: "session-1",
    userId: "user-1",
    currentPhase: DebuggingPhase.RESOLVED,
    coachingMode: CoachingMode.SOCRATIC,
    coachingLevel: CoachingLevel.QUESTION,
    stuckSignalCount: 0,
    reproductionStatus: "REPRODUCED",
    hypotheses: [],
    experiments: [],
    evidence: { capturedAt: new Date().toISOString() },
    fixState: {},
    regressionState: {},
    studentSkill: { level: StudentSkillLevel.INTERMEDIATE, priorSessionsCompleted: 0 },
    actionLog: [],
    recommendationHistory: [],
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("computeSkillSignals", () => {
  it("does not penalize a well-formed hypothesis that was rejected in good faith (Section 11)", () => {
    const state = baseState({
      hypotheses: [
        {
          id: "h1",
          statement: "The loop terminates one iteration early because of a strict comparison.",
          status: HypothesisStatus.REJECTED,
          quality: { specificity: 0.8, testability: 0.7, evidenceConnection: 0.6, falsifiability: 0.75, overall: 0.72 },
          resolutionEvidence: "trace showed the loop ran one iteration too many, not too few",
          createdAt: "",
          updatedAt: "",
        },
      ],
    });
    const signals = computeSkillSignals(state);
    expect(signals.hypothesisQuality).toBeGreaterThanOrEqual(0.6);
  });

  it("scores regressionAwareness low when a fix was applied but regression was never run", () => {
    const state = baseState({ fixState: { proposed: "x", appliedAt: new Date().toISOString() }, regressionState: {} });
    expect(computeSkillSignals(state).regressionAwareness).toBeLessThan(0.3);
  });

  it("scores regressionAwareness high when the fix was applied and regression passed", () => {
    const state = baseState({
      fixState: { proposed: "x", appliedAt: new Date().toISOString() },
      regressionState: { lastRunAt: new Date().toISOString(), passed: true },
    });
    expect(computeSkillSignals(state).regressionAwareness).toBeGreaterThan(0.8);
  });

  it("scores debuggingEfficiency lower when trial-and-error is detected", () => {
    const trialAndErrorActions = ["EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE", "EDIT_CODE", "RUN_CODE"].map(
      (type, i) => ({ id: `a${i}`, type: type as any, at: new Date(i).toISOString() })
    );
    const withTrialAndError = computeSkillSignals(baseState({ actionLog: trialAndErrorActions }));
    const clean = computeSkillSignals(baseState({ actionLog: [] }));
    expect(withTrialAndError.debuggingEfficiency).toBeLessThan(clean.debuggingEfficiency);
  });

  it("returns values in [0,1] for every signal on an empty/fresh state", () => {
    const signals = computeSkillSignals(baseState());
    for (const v of Object.values(signals)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });
});

describe("generatePostmortem", () => {
  it("never fabricates a root cause when none was established", () => {
    const pm = generatePostmortem(baseState({ knownRootCause: undefined }));
    expect(pm.rootCause).toBe("Not yet established.");
  });

  it("assembles a full postmortem consistently from a resolved golden-path state", () => {
    const state = baseState({
      evidence: {
        failure: { failureType: "WRONG_ANSWER", failingInput: "[1,2,3]", errorMessage: undefined },
        capturedAt: new Date().toISOString(),
      },
      hypotheses: [
        {
          id: "h1",
          statement: "boundary condition is off by one",
          status: HypothesisStatus.REJECTED,
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "h2",
          statement: "pointer update skips the last valid index",
          status: HypothesisStatus.SUPPORTED,
          resolutionEvidence: "trace confirmed the pointer jumps past the final element",
          createdAt: "",
          updatedAt: "",
        },
      ],
      experiments: [
        {
          id: "e1",
          hypothesisId: "h2",
          expectedObservation: "pointer should equal n-1 at the last valid step",
          action: "INSPECT_TRACE" as any,
          actualObservation: "pointer equaled n",
          interpretation: "confirms the off-by-one",
          createdAt: "",
        },
      ],
      knownRootCause: "The update advances the pointer before checking the loop condition.",
      fixState: { proposed: "Reorder the check before the update.", appliedAt: new Date().toISOString(), alignsWithRootCause: true },
      regressionState: { lastRunAt: new Date().toISOString(), passed: true },
    });

    const pm = generatePostmortem(state);
    expect(pm.rootCause).toContain("advances the pointer");
    expect(pm.rejectedHypotheses).toEqual(["boundary condition is off by one"]);
    expect(pm.studentHypotheses).toHaveLength(2);
    expect(pm.successfulExperiment).toContain("confirms the off-by-one");
    expect(pm.regressionResult).toBe("Regression suite passed.");
    expect(pm.evidence).toContain("failure");
    expect(pm.keyLearning).toContain("advances the pointer");
  });

  it("recommends practice tied to the weakest actual signal, not a fixed default", () => {
    const strongEverythingExceptRegression = baseState({
      fixState: { proposed: "x", appliedAt: new Date().toISOString() },
      regressionState: {}, // never run -> regressionAwareness will be the weakest signal
      knownRootCause: "root cause established",
      hypotheses: [
        {
          id: "h1",
          statement: "x",
          status: HypothesisStatus.SUPPORTED,
          resolutionEvidence: "evidence",
          quality: { specificity: 1, testability: 1, evidenceConnection: 1, falsifiability: 1, overall: 1 },
          createdAt: "",
          updatedAt: "",
        },
      ],
      experiments: [
        { id: "e1", hypothesisId: "h1", expectedObservation: "x", action: "INSPECT_TRACE" as any, actualObservation: "y", interpretation: "z", createdAt: "" },
      ],
    });
    const pm = generatePostmortem(strongEverythingExceptRegression);
    expect(pm.recommendedPractice).toMatch(/regression/i);
  });
});
