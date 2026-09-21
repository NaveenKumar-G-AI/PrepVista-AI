import { describe, it, expect } from "vitest";
import { canTransition, assertTransition, InvalidStateTransitionError } from "../../src/state/sessionStateMachine.js";

describe("session state machine — §95", () => {
  it("allows READY → ACTIVE", () => {
    expect(canTransition("READY", "ACTIVE")).toBe(true);
  });
  it("allows ACTIVE → FEEDBACK → RETRY → FEEDBACK (the correction loop)", () => {
    expect(canTransition("ACTIVE", "FEEDBACK")).toBe(true);
    expect(canTransition("FEEDBACK", "RETRY")).toBe(true);
    expect(canTransition("RETRY", "FEEDBACK")).toBe(true);
  });
  it("allows FEEDBACK → VERIFICATION → FEEDBACK → COMPLETED", () => {
    expect(canTransition("FEEDBACK", "VERIFICATION")).toBe(true);
    expect(canTransition("VERIFICATION", "FEEDBACK")).toBe(true);
    expect(canTransition("FEEDBACK", "COMPLETED")).toBe(true);
  });
  it("rejects resurrecting a COMPLETED session", () => {
    expect(canTransition("COMPLETED", "ACTIVE")).toBe(false);
  });
  it("rejects resurrecting an ABANDONED session", () => {
    expect(canTransition("ABANDONED", "ACTIVE")).toBe(false);
  });
  it("rejects skipping straight from READY to COMPLETED", () => {
    expect(canTransition("READY", "COMPLETED")).toBe(false);
  });
  it("assertTransition throws a typed error on an invalid move", () => {
    expect(() => assertTransition("COMPLETED", "ACTIVE")).toThrow(InvalidStateTransitionError);
  });
  it("PAUSED can only resume to ACTIVE or be ABANDONED", () => {
    expect(canTransition("PAUSED", "ACTIVE")).toBe(true);
    expect(canTransition("PAUSED", "ABANDONED")).toBe(true);
    expect(canTransition("PAUSED", "FEEDBACK")).toBe(false);
  });
});
