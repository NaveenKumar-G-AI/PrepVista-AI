import { describe, it, expect } from "vitest";
import { checkForMastery, evaluateUnlockedMilestone } from "../src/engine/milestoneEvidence.js";
import type { PathMilestone, StudentCapabilityState } from "../src/domain/types.js";

function milestone(overrides: Partial<PathMilestone> = {}): PathMilestone {
  return {
    id: "m1",
    pathId: "p1",
    stageId: "st1",
    name: "Test milestone",
    requiredCapabilities: ["cap.a"],
    evidenceRequirements: [{ capabilityCode: "cap.a", dimension: "accuracy", minValue: 70, minEvidenceCount: 3 }],
    status: "AVAILABLE",
    priority: 1,
    critical: true,
    createdAt: "",
    verifiedAt: null,
    ...overrides,
  };
}

describe("evaluateUnlockedMilestone", () => {
  it("never marks complete just because a lesson/video was opened -- requires the actual evidence requirement", () => {
    const noEvidence: StudentCapabilityState[] = [];
    const result = evaluateUnlockedMilestone(milestone(), noEvidence);
    expect(result.status).toBe("AVAILABLE");
    expect(result.readyToProve).toBe(false);
  });

  it("moves to IN_PROGRESS once some evidence exists but the bar isn't met", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 50, accuracy: 50, speed: 50, transfer: 50, consistency: 50, evidenceCount: 1, lastEvidenceAt: "now" },
    ];
    const result = evaluateUnlockedMilestone(milestone(), states);
    expect(result.status).toBe("IN_PROGRESS");
  });

  it("is readyToProve once the requirement's value AND evidence count are both met", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 80, accuracy: 80, speed: 80, transfer: 80, consistency: 80, evidenceCount: 3, lastEvidenceAt: "now" },
    ];
    const result = evaluateUnlockedMilestone(milestone(), states);
    expect(result.readyToProve).toBe(true);
  });

  it("does not silently un-verify a VERIFIED milestone when current evidence regresses", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 20, accuracy: 20, speed: 20, transfer: 20, consistency: 20, evidenceCount: 5, lastEvidenceAt: "now" },
    ];
    const result = evaluateUnlockedMilestone(milestone({ status: "VERIFIED" }), states);
    expect(result.status).toBe("VERIFIED");
  });

  it("flags NEEDS_IMPROVEMENT (not AVAILABLE) when a met requirement regresses below the bar", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 40, accuracy: 40, speed: 40, transfer: 40, consistency: 40, evidenceCount: 5, lastEvidenceAt: "now" },
    ];
    const result = evaluateUnlockedMilestone(milestone({ status: "IN_PROGRESS" }), states);
    expect(result.status).toBe("NEEDS_IMPROVEMENT");
  });
});

describe("checkForMastery", () => {
  it("only upgrades from VERIFIED, never from a lower status", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 95, accuracy: 95, speed: 95, transfer: 95, consistency: 95, evidenceCount: 10, lastEvidenceAt: "now" },
    ];
    expect(checkForMastery(milestone({ status: "IN_PROGRESS" }), states)).toBe(false);
    expect(checkForMastery(milestone({ status: "VERIFIED" }), states)).toBe(true);
  });

  it("requires clearing the bar by the full mastery buffer, not just meeting it", () => {
    const barely: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 71, accuracy: 71, speed: 71, transfer: 71, consistency: 90, evidenceCount: 10, lastEvidenceAt: "now" },
    ];
    expect(checkForMastery(milestone({ status: "VERIFIED" }), barely)).toBe(false);
  });
});
