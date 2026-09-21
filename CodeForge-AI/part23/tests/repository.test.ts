import { describe, it, expect } from "vitest";
import { InMemoryCoachRepository, ForbiddenError, NotFoundError } from "../src/db/repository.js";
import {
  DebuggingCoachState,
  DebuggingPhase,
  StudentSkillLevel,
  CoachingMode,
  CoachingLevel,
  DebuggingActionType,
  InformationGain,
  ConfidenceLevel,
} from "../src/types.js";

function newState(userId: string, id = "state-1"): DebuggingCoachState {
  return {
    id,
    debuggingSessionId: `session-for-${id}`,
    userId,
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
  };
}

describe("InMemoryCoachRepository — basic CRUD", () => {
  it("creates and retrieves a state for its owner", async () => {
    const repo = new InMemoryCoachRepository();
    await repo.createState(newState("user-a"));
    const fetched = await repo.getState("user-a", "state-1");
    expect(fetched?.userId).toBe("user-a");
  });

  it("returns undefined for a nonexistent id", async () => {
    const repo = new InMemoryCoachRepository();
    expect(await repo.getState("user-a", "does-not-exist")).toBeUndefined();
  });

  it("increments version on save", async () => {
    const repo = new InMemoryCoachRepository();
    const created = await repo.createState(newState("user-a"));
    const saved = await repo.saveState("user-a", created);
    expect(saved.version).toBe(2);
  });
});

describe("InMemoryCoachRepository — ownership enforcement (Section 46: never trust client-provided ownership)", () => {
  it("throws ForbiddenError when a different user reads someone else's state", async () => {
    const repo = new InMemoryCoachRepository();
    await repo.createState(newState("user-a"));
    await expect(repo.getState("user-b", "state-1")).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError when a different user tries to save over someone else's state", async () => {
    const repo = new InMemoryCoachRepository();
    const created = await repo.createState(newState("user-a"));
    await expect(repo.saveState("user-b", { ...created, userId: "user-b" })).rejects.toThrow(ForbiddenError);
  });

  it("throws ForbiddenError on getStateBySession for a non-owner", async () => {
    const repo = new InMemoryCoachRepository();
    await repo.createState(newState("user-a"));
    await expect(repo.getStateBySession("user-b", "session-for-state-1")).rejects.toThrow(ForbiddenError);
  });

  it("throws NotFoundError (not a silent no-op) when appending to a session that doesn't exist", async () => {
    const repo = new InMemoryCoachRepository();
    await expect(
      repo.appendActionEvent("user-a", "nope", { id: "e1", type: "EDIT_CODE", at: new Date().toISOString() })
    ).rejects.toThrow(NotFoundError);
  });
});

describe("InMemoryCoachRepository — event and recommendation history", () => {
  it("accumulates action events and recommendations, retrievable via getHistory", async () => {
    const repo = new InMemoryCoachRepository();
    await repo.createState(newState("user-a"));

    await repo.appendActionEvent("user-a", "state-1", { id: "e1", type: "EDIT_CODE", at: new Date().toISOString() });
    await repo.appendRecommendation("user-a", "state-1", {
      phase: DebuggingPhase.OBSERVE,
      recommendedAction: DebuggingActionType.REPRODUCE_FAILURE,
      reason: "start here",
      evidenceRefs: [],
      expectedInformationGain: InformationGain.MEDIUM,
      coachingLevel: CoachingLevel.OBSERVATION,
      question: "What differs between expected and actual?",
      confidence: ConfidenceLevel.LOW,
      aiGenerated: false,
      candidates: [],
    });

    const history = await repo.getHistory("user-a", "state-1");
    expect(history.events).toHaveLength(1);
    expect(history.recommendations).toHaveLength(1);
  });

  it("a non-owner cannot read another student's history", async () => {
    const repo = new InMemoryCoachRepository();
    await repo.createState(newState("user-a"));
    await expect(repo.getHistory("user-b", "state-1")).rejects.toThrow(ForbiddenError);
  });
});
