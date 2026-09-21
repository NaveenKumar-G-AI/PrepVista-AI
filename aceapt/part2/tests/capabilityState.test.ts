import { describe, expect, it } from "vitest";
import { computeCapabilityState, deriveEvidenceLevel } from "@/lib/domain/capabilityState";
import { SKILLS } from "@/data/seed/skills";
import { makeAttempt } from "./helpers/fixtures";

describe("deriveEvidenceLevel", () => {
  it("returns NOT_ASSESSED with zero attempts", () => {
    expect(deriveEvidenceLevel(null, 0)).toBe("NOT_ASSESSED");
  });
  it("returns LIMITED_EVIDENCE with exactly one attempt", () => {
    expect(deriveEvidenceLevel(1, 1)).toBe("LIMITED_EVIDENCE");
  });
  it("returns EMERGING with exactly two attempts", () => {
    expect(deriveEvidenceLevel(0.5, 2)).toBe("EMERGING");
  });
  it("returns ADVANCED with high accuracy and four or more attempts", () => {
    expect(deriveEvidenceLevel(0.9, 4)).toBe("ADVANCED");
  });
  it("returns STRONG (not ADVANCED) with high accuracy but only three attempts", () => {
    expect(deriveEvidenceLevel(0.9, 3)).toBe("STRONG");
  });
  it("never returns a harsher-than-DEVELOPING label for low accuracy", () => {
    expect(deriveEvidenceLevel(0.1, 5)).toBe("DEVELOPING");
  });
});

describe("computeCapabilityState", () => {
  it("flags UNVERIFIED_INCORRECT after a wrong answer with no follow-up yet", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: false, sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.pendingFollowUps).toContainEqual({ skillId: "Q_NS", reason: "UNVERIFIED_INCORRECT", relatedSkillId: null });
  });

  it("clears the UNVERIFIED_INCORRECT flag once a VERIFICATION question has been asked for that skill", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: false, sequenceIndex: 0 }),
      makeAttempt({ questionId: "q2", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "VERIFICATION", correct: false, sequenceIndex: 1 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.pendingFollowUps.some((f) => f.reason === "UNVERIFIED_INCORRECT")).toBe(false);
  });

  it("does NOT flag a follow-up after a single correct answer", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.pendingFollowUps).toHaveLength(0);
  });

  it("flags PREREQUISITE_UNCHECKED when application evidence is weak and the prerequisite has never been touched", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "COVERAGE", correct: false, sequenceIndex: 0 }),
      makeAttempt({ questionId: "q2", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "VERIFICATION", correct: false, sequenceIndex: 1 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.pendingFollowUps).toContainEqual({ skillId: "Q_PNL", reason: "PREREQUISITE_UNCHECKED", relatedSkillId: "Q_PCT_A" });
  });

  it("does not flag PREREQUISITE_UNCHECKED once the prerequisite has been assessed", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "COVERAGE", correct: false, sequenceIndex: 0 }),
      makeAttempt({ questionId: "q2", skillNodeId: "Q_PNL", applicationType: "APPLICATION", difficulty: 3, purpose: "VERIFICATION", correct: false, sequenceIndex: 1 }),
      makeAttempt({ questionId: "q3", skillNodeId: "Q_PCT_A", applicationType: "APPLICATION", difficulty: 2, purpose: "PREREQUISITE_CHECK", correct: true, sequenceIndex: 2 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.pendingFollowUps.some((f) => f.reason === "PREREQUISITE_UNCHECKED")).toBe(false);
  });

  it("tracks domain and skill coverage correctly", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 0 }),
      makeAttempt({ questionId: "q2", skillNodeId: "L_SEQ", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: true, sequenceIndex: 1 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    expect(state.domainsCovered.sort()).toEqual(["LOGICAL", "QUANTITATIVE"]);
    expect(state.skillsCovered.sort()).toEqual(["L_SEQ", "Q_NS"]);
    expect(state.questionsAttempted).toBe(2);
  });

  it("preserves SKIPPED as distinct from INCORRECT rather than converting it", () => {
    const history = [
      makeAttempt({ questionId: "q1", skillNodeId: "Q_NS", applicationType: "FOUNDATION", difficulty: 1, purpose: "BASELINE", correct: null, status: "SKIPPED", sequenceIndex: 0 }),
    ];
    const state = computeCapabilityState("sess_1", history, SKILLS);
    const skill = state.skills["Q_NS"];
    expect(skill).toBeDefined();
    expect(skill!.attempts[0]?.status).toBe("SKIPPED");
    expect(skill!.overall.correct).toBe(0);
    expect(skill!.overall.accuracy).toBeNull(); // no ANSWERED attempts, so accuracy is unknown, not zero
    expect(state.pendingFollowUps).toHaveLength(0); // a skip is not treated as an incorrect answer
  });
});
