import { describe, it, expect } from "vitest";
import { compareTargets } from "../src/engine/targetSwitch.js";
import type { StudentCapabilityState, TargetRequirement } from "../src/domain/types.js";

describe("compareTargets", () => {
  it("computes transferablePercent as the real readiness against the NEW target, not a guessed number", () => {
    const current: TargetRequirement[] = [{ targetId: "old", capabilityCode: "cap.a", requiredLevel: 80, weight: 1, minEvidence: 3 }];
    const next: TargetRequirement[] = [{ targetId: "new", capabilityCode: "cap.a", requiredLevel: 80, weight: 1, minEvidence: 3 }];
    const states: StudentCapabilityState[] = [
      { studentId: "s1", capabilityCode: "cap.a", level: 40, accuracy: 40, speed: 40, transfer: 40, consistency: 40, evidenceCount: 5, lastEvidenceAt: null },
    ];
    const result = compareTargets(current, next, states);
    expect(result.transferablePercent).toBe(50); // 40/80 = 50%
  });

  it("correctly separates shared vs unique-to-each capability sets", () => {
    const current: TargetRequirement[] = [
      { targetId: "old", capabilityCode: "cap.shared", requiredLevel: 80, weight: 0.5, minEvidence: 3 },
      { targetId: "old", capabilityCode: "cap.old_only", requiredLevel: 80, weight: 0.5, minEvidence: 3 },
    ];
    const next: TargetRequirement[] = [
      { targetId: "new", capabilityCode: "cap.shared", requiredLevel: 80, weight: 0.5, minEvidence: 3 },
      { targetId: "new", capabilityCode: "cap.new_only", requiredLevel: 80, weight: 0.5, minEvidence: 3 },
    ];
    const result = compareTargets(current, next, []);
    expect(result.sharedCapabilities).toEqual(["cap.shared"]);
    expect(result.uniqueToCurrent).toEqual(["cap.old_only"]);
    expect(result.uniqueToNew).toEqual(["cap.new_only"]);
  });
});
