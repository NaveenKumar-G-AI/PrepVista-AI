import { describe, it, expect } from "vitest";
import { canTransition, suggestNextPhase, isBacktrack, advancePhase } from "../src/domain/phase-model.js";
import { DebuggingCoachState, DebuggingPhase, HypothesisStatus, StudentSkillLevel, CoachingMode, CoachingLevel } from "../src/types.js";

function baseState(overrides: Partial<DebuggingCoachState> = {}): DebuggingCoachState {
  return {
    id: "state-1",
    debuggingSessionId: "session-1",
    userId: "user-1",
    currentPhase: DebuggingPhase.OBSERVE,
    coachingMode: CoachingMode.SOCRATIC,
    coachingLevel: CoachingLevel.OBSERVATION,
    stuckSignalCount: 0,
    reproductionStatus: "NOT_ATTEMPTED",
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

describe("canTransition", () => {
  it("allows the default forward path", () => {
    expect(canTransition(DebuggingPhase.OBSERVE, DebuggingPhase.REPRODUCE)).toBe(true);
    expect(canTransition(DebuggingPhase.EXPERIMENT, DebuggingPhase.ROOT_CAUSE)).toBe(true);
  });

  it("allows legitimate backtracks (rejected hypothesis, failed regression)", () => {
    expect(canTransition(DebuggingPhase.EXPERIMENT, DebuggingPhase.HYPOTHESIZE)).toBe(true);
    expect(canTransition(DebuggingPhase.VERIFY, DebuggingPhase.FIX)).toBe(true);
  });

  it("rejects nonsensical jumps", () => {
    expect(canTransition(DebuggingPhase.OBSERVE, DebuggingPhase.FIX)).toBe(false);
    expect(canTransition(DebuggingPhase.RESOLVED, DebuggingPhase.OBSERVE)).toBe(false);
  });

  it("treats staying in place as always valid", () => {
    expect(canTransition(DebuggingPhase.HYPOTHESIZE, DebuggingPhase.HYPOTHESIZE)).toBe(true);
  });
});

describe("suggestNextPhase", () => {
  it("stays in OBSERVE until failure evidence exists", () => {
    const s = baseState();
    expect(suggestNextPhase(s)).toBe(DebuggingPhase.OBSERVE);
  });

  it("moves OBSERVE -> REPRODUCE once failure evidence is captured", () => {
    const s = baseState({ evidence: { failure: { failureType: "WRONG_ANSWER" }, capturedAt: new Date().toISOString() } });
    expect(suggestNextPhase(s)).toBe(DebuggingPhase.REPRODUCE);
  });

  it("does not advance past REPRODUCE until reproduction actually succeeded", () => {
    const s = baseState({ currentPhase: DebuggingPhase.REPRODUCE, reproductionStatus: "FAILED" });
    expect(suggestNextPhase(s)).toBe(DebuggingPhase.REPRODUCE);
  });

  it("sends EXPERIMENT back to HYPOTHESIZE when every hypothesis has died", () => {
    const s = baseState({
      currentPhase: DebuggingPhase.EXPERIMENT,
      hypotheses: [
        { id: "h1", statement: "a", status: HypothesisStatus.REJECTED, createdAt: "", updatedAt: "" },
        { id: "h2", statement: "b", status: HypothesisStatus.ABANDONED, createdAt: "", updatedAt: "" },
      ],
    });
    expect(suggestNextPhase(s)).toBe(DebuggingPhase.HYPOTHESIZE);
  });

  it("advances EXPERIMENT -> ROOT_CAUSE once a hypothesis is supported", () => {
    const s = baseState({
      currentPhase: DebuggingPhase.EXPERIMENT,
      hypotheses: [{ id: "h1", statement: "a", status: HypothesisStatus.SUPPORTED, createdAt: "", updatedAt: "" }],
    });
    expect(suggestNextPhase(s)).toBe(DebuggingPhase.ROOT_CAUSE);
  });

  it("sends VERIFY back to FIX on a failed regression, and to RESOLVED on a passed one", () => {
    const failing = baseState({ currentPhase: DebuggingPhase.VERIFY, regressionState: { passed: false } });
    const passing = baseState({ currentPhase: DebuggingPhase.VERIFY, regressionState: { passed: true } });
    expect(suggestNextPhase(failing)).toBe(DebuggingPhase.FIX);
    expect(suggestNextPhase(passing)).toBe(DebuggingPhase.RESOLVED);
  });

  it("never suggests leaving RESOLVED", () => {
    const s = baseState({ currentPhase: DebuggingPhase.RESOLVED });
    expect(suggestNextPhase(s)).toBe(DebuggingPhase.RESOLVED);
  });
});

describe("isBacktrack", () => {
  it("identifies moving to an earlier phase as a backtrack", () => {
    expect(isBacktrack(DebuggingPhase.EXPERIMENT, DebuggingPhase.HYPOTHESIZE)).toBe(true);
    expect(isBacktrack(DebuggingPhase.HYPOTHESIZE, DebuggingPhase.EXPERIMENT)).toBe(false);
  });
});

describe("advancePhase — multi-hop catch-up", () => {
  it("walks through several phases in one call when the state already supports all of them", () => {
    const s = baseState({
      currentPhase: DebuggingPhase.OBSERVE,
      evidence: { failure: { failureType: "WRONG_ANSWER", sourceLocation: { file: "a.py", line: 1 } }, capturedAt: new Date().toISOString() },
      reproductionStatus: "REPRODUCED",
      hypotheses: [{ id: "h1", statement: "x", status: HypothesisStatus.SUPPORTED, createdAt: "", updatedAt: "" }],
    });
    // OBSERVE -> REPRODUCE -> LOCALIZE -> HYPOTHESIZE -> INVESTIGATE -> EXPERIMENT -> ROOT_CAUSE would each
    // individually be satisfied; advancePhase should not get stuck after a single hop.
    expect(advancePhase(s)).toBe(DebuggingPhase.ROOT_CAUSE);
  });

  it("stops advancing exactly where the evidence genuinely runs out", () => {
    const s = baseState({
      currentPhase: DebuggingPhase.OBSERVE,
      evidence: { failure: { failureType: "WRONG_ANSWER" }, capturedAt: new Date().toISOString() }, // no sourceLocation yet
      reproductionStatus: "REPRODUCED",
    });
    expect(advancePhase(s)).toBe(DebuggingPhase.LOCALIZE); // can't reach HYPOTHESIZE without a source location
  });

  it("does not move at all when still at OBSERVE with no failure evidence", () => {
    const s = baseState();
    expect(advancePhase(s)).toBe(DebuggingPhase.OBSERVE);
  });
});
