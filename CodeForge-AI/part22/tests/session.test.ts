import { describe, expect, it } from "vitest";
import { applyEvent, canTransition, createSession, nextState } from "../src/debugging/session.js";
import { InvalidStateTransitionError } from "../src/types.js";

describe("session state machine", () => {
  it("starts NOT_STARTED and moves to IN_PROGRESS on START", () => {
    const s = createSession({ id: "s1", userId: "u1", challengeId: "c1", submissionId: null, language: "python", startingCode: "" });
    expect(s.state).toBe("NOT_STARTED");
    const started = applyEvent(s, "START");
    expect(started.state).toBe("IN_PROGRESS");
  });

  it("follows the full happy path to RESOLVED and stamps endedAt only on the terminal transition", () => {
    let s = createSession({ id: "s2", userId: "u1", challengeId: "c1", submissionId: null, language: "python", startingCode: "" });
    s = applyEvent(s, "START");
    s = applyEvent(s, "IDENTIFY_ROOT_CAUSE");
    s = applyEvent(s, "ATTEMPT_FIX");
    expect(s.endedAt).toBeNull();
    s = applyEvent(s, "VERIFY_SUCCESS");
    expect(s.state).toBe("RESOLVED");
    expect(s.endedAt).not.toBeNull();
  });

  it("allows retrying a fix after a failed verification", () => {
    let s = createSession({ id: "s3", userId: "u1", challengeId: "c1", submissionId: null, language: "python", startingCode: "" });
    s = applyEvent(s, "START");
    s = applyEvent(s, "IDENTIFY_ROOT_CAUSE");
    s = applyEvent(s, "ATTEMPT_FIX");
    s = applyEvent(s, "VERIFY_FAILURE");
    expect(s.state).toBe("FAILED");
    s = applyEvent(s, "ATTEMPT_FIX");
    expect(s.state).toBe("FIX_ATTEMPTED");
  });

  it("rejects invalid transitions, e.g. skipping straight to a fix", () => {
    const s = createSession({ id: "s4", userId: "u1", challengeId: "c1", submissionId: null, language: "python", startingCode: "" });
    expect(canTransition(s.state, "ATTEMPT_FIX")).toBe(false);
    expect(() => nextState(s.state, "ATTEMPT_FIX")).toThrow(InvalidStateTransitionError);
  });

  it("allows abandoning from IN_PROGRESS and stamps endedAt", () => {
    let s = createSession({ id: "s5", userId: "u1", challengeId: "c1", submissionId: null, language: "python", startingCode: "" });
    s = applyEvent(s, "START");
    s = applyEvent(s, "ABANDON");
    expect(s.state).toBe("ABANDONED");
    expect(s.endedAt).not.toBeNull();
  });

  it("has no outgoing transitions from terminal states", () => {
    expect(canTransition("RESOLVED", "ATTEMPT_FIX")).toBe(false);
    expect(canTransition("ABANDONED", "START")).toBe(false);
  });
});
