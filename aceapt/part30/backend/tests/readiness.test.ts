import { describe, it, expect } from "vitest";
import { calculateReadiness, calculateReadinessDimensions } from "../src/engine/readiness.js";
import type { PathMilestone, StudentCapabilityState, TargetRequirement } from "../src/domain/types.js";

const requirements: TargetRequirement[] = [
  { targetId: "t1", capabilityCode: "cap.a", requiredLevel: 80, weight: 0.5, minEvidence: 3 },
  { targetId: "t1", capabilityCode: "cap.b", requiredLevel: 80, weight: 0.5, minEvidence: 3 },
];

describe("calculateReadiness", () => {
  it("returns 0 for a student with no evidence at all", () => {
    expect(calculateReadiness(requirements, [])).toBe(0);
  });

  it("returns 100 when every requirement is fully met", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 90, accuracy: 90, speed: 90, transfer: 90, consistency: 90, evidenceCount: 5, lastEvidenceAt: null },
      { studentId: "s1", capabilityCode: "cap.b", level: 85, accuracy: 85, speed: 85, transfer: 85, consistency: 85, evidenceCount: 5, lastEvidenceAt: null },
    ];
    expect(calculateReadiness(requirements, states)).toBe(100);
  });

  it("caps each capability's contribution at 100% of its own requirement -- overshooting one cannot mask a real gap in another", () => {
    const overOnA: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 160, accuracy: 100, speed: 100, transfer: 100, consistency: 100, evidenceCount: 5, lastEvidenceAt: null }, // absurdly high, would be >100% if uncapped
      { studentId: "s1", capabilityCode: "cap.b", level: 0, accuracy: 0, speed: 0, transfer: 0, consistency: 0, evidenceCount: 0, lastEvidenceAt: null },
    ];
    // Uncapped this would read as (160/80*0.5 + 0/80*0.5)*100 = 100. Capped it must be (1*0.5 + 0*0.5)*100 = 50.
    expect(calculateReadiness(requirements, overOnA)).toBe(50);
  });
});

describe("calculateReadinessDimensions", () => {
  it("gap contributions sum to approximately 1 when there is an open gap on more than one dimension (allowing for independent per-dimension rounding)", () => {
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 50, accuracy: 50, speed: 40, transfer: 60, consistency: 50, evidenceCount: 5, lastEvidenceAt: null },
      { studentId: "s1", capabilityCode: "cap.b", level: 50, accuracy: 55, speed: 45, transfer: 50, consistency: 50, evidenceCount: 5, lastEvidenceAt: null },
    ];
    const milestones: PathMilestone[] = [];
    const dims = calculateReadinessDimensions(requirements, states, milestones, 90);
    const total = dims.reduce((a, d) => a + d.gapContribution, 0);
    expect(total).toBeGreaterThan(0.95);
    expect(total).toBeLessThan(1.05);
  });

  it("the proof dimension reflects the share of critical milestones actually verified", () => {
    const states: StudentCapabilityState[] = [];
    const milestones: PathMilestone[] = [
      { id: "m1", pathId: "p1", stageId: "st1", name: "A", requiredCapabilities: ["cap.a"], evidenceRequirements: [], status: "VERIFIED", priority: 1, critical: true, createdAt: "", verifiedAt: "now" },
      { id: "m2", pathId: "p1", stageId: "st1", name: "B", requiredCapabilities: ["cap.b"], evidenceRequirements: [], status: "LOCKED", priority: 2, critical: true, createdAt: "", verifiedAt: null },
      { id: "m3", pathId: "p1", stageId: "st1", name: "C (optional)", requiredCapabilities: ["cap.b"], evidenceRequirements: [], status: "LOCKED", priority: 3, critical: false, createdAt: "", verifiedAt: null },
    ];
    const dims = calculateReadinessDimensions(requirements, states, milestones, 90);
    const proof = dims.find((d) => d.key === "proof")!;
    // 1 of 2 *critical* milestones verified -- the non-critical one must not count.
    expect(proof.current).toBe(50);
  });
});
