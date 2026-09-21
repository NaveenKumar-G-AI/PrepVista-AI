import { describe, it, expect } from "vitest";
import { canTransition, assertTransition } from "../engine/stateMachine.js";

describe("session state machine", () => {
  it("allows the full happy-path sequence", () => {
    expect(canTransition("IN_PROGRESS", "SUBMITTED")).toBe(true);
    expect(canTransition("SUBMITTED", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "ANALYZED")).toBe(true);
    expect(canTransition("ANALYZED", "COMPLETED")).toBe(true);
  });

  it("allows time-expiry as an alternate path into PROCESSING", () => {
    expect(canTransition("IN_PROGRESS", "TIME_EXPIRED")).toBe(true);
    expect(canTransition("TIME_EXPIRED", "PROCESSING")).toBe(true);
  });

  it("rejects skipping states", () => {
    expect(canTransition("IN_PROGRESS", "ANALYZED")).toBe(false);
    expect(canTransition("IN_PROGRESS", "PROCESSING")).toBe(false);
    expect(canTransition("SUBMITTED", "COMPLETED")).toBe(false);
  });

  it("rejects any transition out of COMPLETED", () => {
    expect(canTransition("COMPLETED", "IN_PROGRESS")).toBe(false);
    expect(canTransition("COMPLETED", "ANALYZED")).toBe(false);
  });

  it("rejects moving backwards", () => {
    expect(canTransition("PROCESSING", "IN_PROGRESS")).toBe(false);
    expect(canTransition("ANALYZED", "SUBMITTED")).toBe(false);
  });

  it("assertTransition throws with a descriptive message on an invalid move", () => {
    expect(() => assertTransition("IN_PROGRESS", "COMPLETED")).toThrow(/Invalid session state transition/);
  });

  it("assertTransition is silent on a valid move", () => {
    expect(() => assertTransition("IN_PROGRESS", "SUBMITTED")).not.toThrow();
  });
});
