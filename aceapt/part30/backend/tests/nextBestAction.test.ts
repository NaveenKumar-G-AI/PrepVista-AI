import { describe, it, expect } from "vitest";
import { determineNextBestAction } from "../src/engine/nextBestAction.js";
import type { Bottleneck, PathMilestone } from "../src/domain/types.js";
import type { MilestoneEvaluation } from "../src/engine/milestoneEvidence.js";

function bottleneck(overrides: Partial<Bottleneck> = {}): Bottleneck {
  return {
    capabilityCode: "cap.a",
    capabilityName: "Capability A",
    dimension: "speed",
    currentValue: 45,
    targetRequirement: 75,
    gap: 30,
    evidence: { accuracy: 85, speed: 45, transfer: 60, consistency: 66, evidenceCount: 4 },
    explanation: "test",
    ...overrides,
  };
}

describe("determineNextBestAction", () => {
  it("prioritizes a readyToProve milestone over the bottleneck action", () => {
    const milestone: PathMilestone = {
      id: "m1", pathId: "p1", stageId: "st1", name: "Ready milestone", requiredCapabilities: ["cap.b"],
      evidenceRequirements: [], status: "IN_PROGRESS", priority: 1, critical: true, createdAt: "", verifiedAt: null,
    };
    const evaluation: MilestoneEvaluation = { status: "IN_PROGRESS", readyToProve: true, unmetRequirements: [] };
    const draft = determineNextBestAction(bottleneck(), [{ milestone, evaluation }], "STANDARD");
    expect(draft?.type).toBe("PROVE");
    expect(draft?.milestoneId).toBe("m1");
  });

  it("excludes a milestone the student explicitly skipped from readyToProve consideration (Section 34)", () => {
    const milestone: PathMilestone = {
      id: "m1", pathId: "p1", stageId: "st1", name: "Skipped milestone", requiredCapabilities: ["cap.b"],
      evidenceRequirements: [], status: "IN_PROGRESS", priority: 1, critical: false, createdAt: "", verifiedAt: null,
    };
    const evaluation: MilestoneEvaluation = { status: "IN_PROGRESS", readyToProve: true, unmetRequirements: [] };
    const draft = determineNextBestAction(bottleneck(), [{ milestone, evaluation }], "STANDARD", new Set(["m1"]));
    expect(draft?.type).not.toBe("PROVE");
  });

  it("maps a speed-dimension bottleneck to PRACTICE, whose evidence type can actually move speed", () => {
    const draft = determineNextBestAction(bottleneck({ dimension: "speed" }), [], "STANDARD");
    expect(draft?.type).toBe("PRACTICE");
  });

  it("maps a low-accuracy bottleneck to LEARN, and a moderate one to REVISE", () => {
    const low = determineNextBestAction(bottleneck({ dimension: "accuracy", currentValue: 25 }), [], "STANDARD");
    expect(low?.type).toBe("LEARN");
    const moderate = determineNextBestAction(bottleneck({ dimension: "accuracy", currentValue: 55 }), [], "STANDARD");
    expect(moderate?.type).toBe("REVISE");
  });

  it("regression test: RECOVERY mode never downgrades a speed-dimension PRACTICE to REFLECT (the dead-loop bug)", () => {
    // The exact bug found by running the loop live: downgrading PRACTICE to
    // REFLECT in Recovery mode meant the recommended action could no longer
    // record evidence, so the bottleneck it was meant to fix could never
    // close, which kept the path in Recovery mode forever.
    const draft = determineNextBestAction(bottleneck({ dimension: "speed", currentValue: 30 }), [], "RECOVERY");
    expect(draft?.type).toBe("PRACTICE");
    expect(draft?.type).not.toBe("REFLECT");
  });

  it("RECOVERY mode still steps TRANSFER down to REVISE, avoiding novel-context pressure while rebuilding", () => {
    const draft = determineNextBestAction(bottleneck({ dimension: "transfer", currentValue: 30 }), [], "RECOVERY");
    expect(draft?.type).toBe("REVISE");
  });

  it("DEEP_MASTERY escalates a solid REVISE-level accuracy bottleneck toward TRANSFER instead of stopping at the bar", () => {
    const draft = determineNextBestAction(bottleneck({ dimension: "accuracy", currentValue: 60 }), [], "DEEP_MASTERY");
    expect(draft?.type).toBe("TRANSFER");
  });

  it("returns null when there is no bottleneck and nothing ready to prove", () => {
    expect(determineNextBestAction(null, [], "STANDARD")).toBeNull();
  });

  it("regression test: with zero evidence, recommends a baseline assessment instead of leaving the student with nothing (Section 53)", () => {
    const gaps = [{ capabilityCode: "cap.a", requiredLevel: 80, currentLevel: 0, gap: 80, weight: 1, minEvidence: 3, evidenceCount: 0, evidenceSufficient: false, severity: 80 }];
    const draft = determineNextBestAction(null, [], "STANDARD", new Set(), gaps, [{ code: "cap.a", name: "Capability A", category: "x" }]);
    expect(draft).not.toBeNull();
    expect(draft?.headline.toLowerCase()).toContain("assessment");
    expect(draft?.headline).toContain("Capability A");
  });

  it("returns null (not a fabricated assessment prompt) once every requirement is genuinely already met", () => {
    const gaps = [{ capabilityCode: "cap.a", requiredLevel: 80, currentLevel: 85, gap: 0, weight: 1, minEvidence: 3, evidenceCount: 5, evidenceSufficient: true, severity: 0 }];
    expect(determineNextBestAction(null, [], "STANDARD", new Set(), gaps)).toBeNull();
  });
});
