import { describe, it, expect } from "vitest";
import { canTransition, transition, InvalidTransitionError, resolveNextState, isTerminal } from "@/lib/engine/stateMachine";

describe("state machine", () => {
  it("allows the documented forward path", () => {
    const path: [string, string][] = [
      ["CREATED", "ACTIVE"],
      ["ACTIVE", "INVESTIGATING"],
      ["INVESTIGATING", "MITIGATED"],
      ["MITIGATED", "FIXING"],
      ["FIXING", "VERIFYING"],
      ["VERIFYING", "RESOLVED"],
      ["RESOLVED", "POSTMORTEM"],
      ["POSTMORTEM", "EVALUATED"],
    ];
    for (const [from, to] of path) {
      expect(canTransition(from as never, to as never)).toBe(true);
    }
  });

  it("rejects skipping states (brief: 'Student tries to modify hidden ground truth' sibling case — server must validate transitions)", () => {
    expect(canTransition("CREATED", "FIXING")).toBe(false);
    expect(canTransition("CREATED", "EVALUATED")).toBe(false);
    expect(canTransition("ACTIVE", "RESOLVED")).toBe(false);
  });

  it("throws InvalidTransitionError with useful fields on an invalid move", () => {
    expect(() => transition("CREATED", "RESOLVED")).toThrowError(InvalidTransitionError);
    try {
      transition("CREATED", "RESOLVED");
    } catch (e) {
      expect(e).toBeInstanceOf(InvalidTransitionError);
      expect((e as InvalidTransitionError).from).toBe("CREATED");
      expect((e as InvalidTransitionError).to).toBe("RESOLVED");
    }
  });

  it("treats same-state as a no-op, not an error (idempotent retries)", () => {
    expect(canTransition("INVESTIGATING", "INVESTIGATING")).toBe(true);
    expect(transition("MITIGATED", "MITIGATED")).toBe("MITIGATED");
  });

  it("allows VERIFYING to fall back to FIXING or INVESTIGATING (a failed verification isn't a dead end)", () => {
    expect(canTransition("VERIFYING", "FIXING")).toBe(true);
    expect(canTransition("VERIFYING", "INVESTIGATING")).toBe(true);
  });

  it("resolveNextState falls back to current state on an unreachable proposal", () => {
    expect(resolveNextState("CREATED", "EVALUATED")).toBe("CREATED");
    expect(resolveNextState("CREATED", "ACTIVE")).toBe("ACTIVE");
    expect(resolveNextState("CREATED", undefined)).toBe("CREATED");
  });

  it("EVALUATED is terminal", () => {
    expect(isTerminal("EVALUATED")).toBe(true);
    expect(isTerminal("RESOLVED")).toBe(false);
    expect(canTransition("EVALUATED", "ACTIVE")).toBe(false);
  });
});
