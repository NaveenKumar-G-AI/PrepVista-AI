import { describe, it, expect } from "vitest";
import { diagnoseFailure } from "../src/engine/failureAnalysis.js";
import type { StudentCapabilityState } from "../src/domain/types.js";

function priorState(overrides: Partial<StudentCapabilityState> = {}): StudentCapabilityState {
  return { studentId: "s1", capabilityCode: "cap.a", level: 70, accuracy: 70, speed: 70, transfer: 70, consistency: 70, evidenceCount: 5, lastEvidenceAt: "now", ...overrides };
}

describe("diagnoseFailure", () => {
  it("reads insufficient evidence when there is barely any history yet", () => {
    const d = diagnoseFailure({ passed: false }, priorState({ evidenceCount: 1 }));
    expect(d.cause).toBe("INSUFFICIENT_EVIDENCE");
  });

  it("distinguishes transfer weakness: strong on familiar problems, weak on a novel one", () => {
    const d = diagnoseFailure({ correct: 4, total: 10, contextNovelty: "NOVEL", passed: false }, priorState({ accuracy: 80 }));
    expect(d.cause).toBe("TRANSFER_WEAKNESS");
  });

  it("distinguishes a speed issue: accuracy was fine, but it ran over the allowed time", () => {
    const d = diagnoseFailure(
      { correct: 8, total: 10, timeTakenSeconds: 1600, timeAllowedSeconds: 1200, passed: false },
      priorState()
    );
    expect(d.cause).toBe("SPEED_ISSUE");
  });

  it("distinguishes conceptual weakness: low accuracy on a familiar problem, no timing issue", () => {
    const d = diagnoseFailure({ correct: 2, total: 10, passed: false }, priorState({ accuracy: 60, consistency: 80 }));
    expect(d.cause).toBe("CONCEPTUAL_WEAKNESS");
  });

  it("never returns a made-up psychological or medical cause", () => {
    const causes = ["CONCEPTUAL_WEAKNESS", "APPLICATION_WEAKNESS", "TRANSFER_WEAKNESS", "SPEED_ISSUE", "CONSISTENCY_ISSUE", "RETENTION_ISSUE", "INSUFFICIENT_EVIDENCE"];
    const d = diagnoseFailure({ correct: 3, total: 10, passed: false }, priorState());
    expect(causes).toContain(d.cause);
  });
});
