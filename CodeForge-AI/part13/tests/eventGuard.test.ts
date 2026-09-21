import { describe, expect, it } from "vitest";
import { applyLifecycleEvent, type EvaluationTrackedState } from "../src/state/eventGuard.js";
import type { LifecycleEvent } from "../src/types/normalized.js";

function evt(state: LifecycleEvent["state"], sequence: number | null, iso = "2026-08-17T10:00:00.000Z"): LifecycleEvent {
  return { submissionId: "sub_1", evaluationId: "eval_1", state, sequence, emittedAtIso: iso };
}

describe("evaluation lifecycle event guard", () => {
  it("accepts the first event for an evaluation unconditionally", () => {
    const { decision, state } = applyLifecycleEvent(null, evt("SUBMITTED", 1));
    expect(decision.accept).toBe(true);
    expect(state.currentState).toBe("SUBMITTED");
  });

  it("accepts forward progression in order", () => {
    let tracked: EvaluationTrackedState | null = null;
    for (const [state, seq] of [["SUBMITTED", 1], ["QUEUED", 2], ["RUNNING", 3], ["COMPLETED", 4]] as const) {
      const r = applyLifecycleEvent(tracked, evt(state, seq));
      expect(r.decision.accept).toBe(true);
      tracked = r.state;
    }
    expect(tracked?.currentState).toBe("COMPLETED");
    expect(tracked?.isFinalized).toBe(true);
  });

  it("rejects a stale RUNNING event that arrives after COMPLETED (out-of-order delivery)", () => {
    let tracked: EvaluationTrackedState | null = null;
    tracked = applyLifecycleEvent(tracked, evt("SUBMITTED", 1)).state;
    tracked = applyLifecycleEvent(tracked, evt("COMPLETED", 4)).state;

    const stale = applyLifecycleEvent(tracked, evt("RUNNING", 3));
    expect(stale.decision.accept).toBe(false);
    if (!stale.decision.accept) expect(stale.decision.reasonCode).toBe("ALREADY_FINALIZED");
    // state remains COMPLETED, never moved backwards
    expect(stale.state.currentState).toBe("COMPLETED");
  });

  it("rejects an out-of-order event by sequence even before finalization", () => {
    let tracked: EvaluationTrackedState | null = null;
    tracked = applyLifecycleEvent(tracked, evt("RUNNING", 5)).state;
    const stale = applyLifecycleEvent(tracked, evt("QUEUED", 2));
    expect(stale.decision.accept).toBe(false);
    if (!stale.decision.accept) expect(stale.decision.reasonCode).toBe("STALE_SEQUENCE");
  });

  it("treats an exact duplicate event as a safe no-op, not an error state change", () => {
    let tracked: EvaluationTrackedState | null = null;
    tracked = applyLifecycleEvent(tracked, evt("RUNNING", 5)).state;
    const dup = applyLifecycleEvent(tracked, evt("RUNNING", 5));
    expect(dup.decision.accept).toBe(false);
    if (!dup.decision.accept) expect(dup.decision.reasonCode).toBe("DUPLICATE");
    expect(dup.state.currentState).toBe("RUNNING");
  });

  it("never accepts any transition once finalized, including a second COMPLETED", () => {
    let tracked: EvaluationTrackedState | null = null;
    tracked = applyLifecycleEvent(tracked, evt("COMPLETED", 1)).state;
    const secondComplete = applyLifecycleEvent(tracked, evt("COMPLETED", 2));
    expect(secondComplete.decision.accept).toBe(false);
    if (!secondComplete.decision.accept) expect(secondComplete.decision.reasonCode).toBe("ALREADY_FINALIZED");
  });
});
