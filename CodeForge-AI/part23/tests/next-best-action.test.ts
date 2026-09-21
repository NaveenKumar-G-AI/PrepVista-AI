import { describe, it, expect } from "vitest";
import { rankActions, selectNextBestAction } from "../src/domain/next-best-action.js";
import {
  DebuggingActionType,
  DebuggingCoachState,
  DebuggingPhase,
  HypothesisStatus,
  StudentSkillLevel,
  CoachingMode,
  CoachingLevel,
  InformationGain,
  ConfidenceLevel,
} from "../src/types.js";

function baseState(overrides: Partial<DebuggingCoachState> = {}): DebuggingCoachState {
  return {
    id: "state-1",
    debuggingSessionId: "session-1",
    userId: "user-1",
    currentPhase: DebuggingPhase.EXPERIMENT,
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

describe("rankActions — information gain / distinguishing hypotheses (Section 9)", () => {
  it("ranks a variable-inspection action highest when it would separate two live hypotheses", () => {
    const s = baseState({
      hypotheses: [
        {
          id: "h1",
          statement: "left boundary is off by one",
          status: HypothesisStatus.TESTING,
          distinguishingTargets: ["left"],
          createdAt: "",
          updatedAt: "",
        },
        {
          id: "h2",
          statement: "right boundary is off by one",
          status: HypothesisStatus.TESTING,
          distinguishingTargets: ["left"],
          createdAt: "",
          updatedAt: "",
        },
      ],
      evidence: { trace: [{ step: 1, variables: { left: 4 } }], capturedAt: new Date().toISOString() },
    });

    const ranked = rankActions(s);
    const top = ranked[0]!;
    expect([DebuggingActionType.INSPECT_VARIABLE, DebuggingActionType.INSPECT_TRACE, DebuggingActionType.TEST_HYPOTHESIS, DebuggingActionType.COMPARE_STATES]).toContain(
      top.action
    );
    expect(top.informationGain).toBe(InformationGain.HIGH);
    expect(top.target).toBe("left");
  });

  it("gives low information gain to broad actions (e.g. isolating a whole function) while hypotheses are still competing", () => {
    const s = baseState({
      hypotheses: [
        { id: "h1", statement: "a", status: HypothesisStatus.TESTING, createdAt: "", updatedAt: "" },
        { id: "h2", statement: "b", status: HypothesisStatus.TESTING, createdAt: "", updatedAt: "" },
      ],
    });
    const ranked = rankActions(s);
    const isolate = ranked.find((r) => r.action === DebuggingActionType.ISOLATE_FUNCTION);
    expect(isolate?.informationGain).toBe(InformationGain.LOW);
  });
});

describe("rankActions — safety gating (Section 8, 38)", () => {
  it("never recommends APPLY_FIX before a root cause or supported hypothesis exists", () => {
    const s = baseState({ currentPhase: DebuggingPhase.FIX, hypotheses: [], knownRootCause: undefined });
    const ranked = rankActions(s);
    expect(ranked.some((r) => r.action === DebuggingActionType.APPLY_FIX)).toBe(false);
  });

  it("allows APPLY_FIX once a hypothesis is SUPPORTED", () => {
    const s = baseState({
      currentPhase: DebuggingPhase.FIX,
      hypotheses: [{ id: "h1", statement: "a", status: HypothesisStatus.SUPPORTED, createdAt: "", updatedAt: "" }],
    });
    const ranked = rankActions(s);
    expect(ranked.some((r) => r.action === DebuggingActionType.APPLY_FIX)).toBe(true);
  });

  it("never recommends RUN_REGRESSION before a fix has been proposed", () => {
    const s = baseState({ currentPhase: DebuggingPhase.VERIFY, fixState: {} });
    const ranked = rankActions(s);
    expect(ranked.some((r) => r.action === DebuggingActionType.RUN_REGRESSION)).toBe(false);
  });
});

describe("rankActions — never recommends actions whose required evidence is absent (Section 6)", () => {
  it("heavily discounts INSPECT_TRACE when there is no trace evidence at all", () => {
    const s = baseState({ evidence: { capturedAt: new Date().toISOString() } }); // no trace field
    const ranked = rankActions(s);
    const traceAction = ranked.find((r) => r.action === DebuggingActionType.INSPECT_TRACE);
    const topScore = ranked[0]!.score;
    expect(traceAction).toBeDefined();
    expect(traceAction!.score).toBeLessThan(topScore);
  });
});

describe("rankActions — non-repetition (Section 36)", () => {
  it("penalizes repeating the same action+target that was already recommended without new evidence", () => {
    const repeatedRec = {
      phase: DebuggingPhase.EXPERIMENT,
      recommendedAction: DebuggingActionType.INSPECT_VARIABLE,
      target: "left",
      reason: "x",
      evidenceRefs: [],
      expectedInformationGain: InformationGain.HIGH,
      coachingLevel: CoachingLevel.QUESTION,
      question: "x",
      confidence: ConfidenceLevel.HIGH,
      aiGenerated: false,
      candidates: [],
    };
    const s = baseState({
      hypotheses: [
        { id: "h1", statement: "a", status: HypothesisStatus.TESTING, distinguishingTargets: ["left"], createdAt: "", updatedAt: "" },
        { id: "h2", statement: "b", status: HypothesisStatus.TESTING, distinguishingTargets: ["left"], createdAt: "", updatedAt: "" },
      ],
      recommendationHistory: [repeatedRec, repeatedRec, repeatedRec],
    });
    const ranked = rankActions(s);
    const inspectLeft = ranked.find((r) => r.action === DebuggingActionType.INSPECT_VARIABLE && r.target === "left");
    expect(inspectLeft).toBeDefined();
    // Should have been knocked well down from a "fresh" score of ~0.85-1.0
    expect(inspectLeft!.score).toBeLessThan(0.6);
  });
});

describe("selectNextBestAction", () => {
  it("returns a fully-populated envelope with the phase's canonical question when AI has not run", () => {
    const s = baseState({ currentPhase: DebuggingPhase.HYPOTHESIZE, hypotheses: [] });
    const nba = selectNextBestAction(s, CoachingLevel.QUESTION);
    expect(nba.aiGenerated).toBe(false);
    expect(nba.phase).toBe(DebuggingPhase.HYPOTHESIZE);
    expect(nba.question.length).toBeGreaterThan(0);
    expect(nba.candidates.length).toBeGreaterThan(0);
    expect(Object.values(DebuggingActionType)).toContain(nba.recommendedAction);
  });
});
