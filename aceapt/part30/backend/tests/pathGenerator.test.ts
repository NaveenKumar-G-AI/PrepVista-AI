import { describe, it, expect } from "vitest";
import { DEFAULT_TEMPLATE, generateMilestones, resolveTemplate } from "../src/engine/pathGenerator.js";
import type { Capability, TargetRequirement } from "../src/domain/types.js";

describe("resolveTemplate", () => {
  it("returns the curated template for a known target code", () => {
    expect(resolveTemplate("data-analyst").targetCode).toBe("data-analyst");
  });

  it("falls back to DEFAULT_TEMPLATE for an unknown target -- Section 9 requires every target to get a working path", () => {
    expect(resolveTemplate("some-brand-new-target-nobody-configured").targetCode).toBe(DEFAULT_TEMPLATE.targetCode);
  });
});

describe("generateMilestones", () => {
  const capabilities: Capability[] = [
    { code: "cap.important", name: "Important Capability", category: "core" },
    { code: "cap.minor", name: "Minor Capability", category: "core" },
  ];
  const requirements: TargetRequirement[] = [
    { targetId: "t1", capabilityCode: "cap.important", requiredLevel: 80, weight: 0.3, minEvidence: 3 },
    { targetId: "t1", capabilityCode: "cap.minor", requiredLevel: 80, weight: 0.05, minEvidence: 3 },
  ];

  it("marks a heavily-weighted capability's milestone critical, and a lightly-weighted one skippable (Section 34)", () => {
    const milestones = generateMilestones(DEFAULT_TEMPLATE, requirements, capabilities);
    const important = milestones.find((m) => m.requiredCapabilities[0] === "cap.important" && m.stageKey === "foundation");
    const minor = milestones.find((m) => m.requiredCapabilities[0] === "cap.minor" && m.stageKey === "foundation");
    expect(important?.critical).toBe(true);
    expect(minor?.critical).toBe(false);
  });

  it("the proof stage is always critical regardless of weight", () => {
    const milestones = generateMilestones(DEFAULT_TEMPLATE, requirements, capabilities);
    const proofMinor = milestones.find((m) => m.requiredCapabilities[0] === "cap.minor" && m.stageKey === "proof");
    expect(proofMinor?.critical).toBe(true);
  });

  it("sets each stage's evidence bar as a fraction of the target's required level, not the raw requirement", () => {
    const milestones = generateMilestones(DEFAULT_TEMPLATE, requirements, capabilities);
    const foundation = milestones.find((m) => m.requiredCapabilities[0] === "cap.important" && m.stageKey === "foundation")!;
    expect(foundation.evidenceRequirements[0].minValue).toBeLessThan(80);
    const proof = milestones.find((m) => m.requiredCapabilities[0] === "cap.important" && m.stageKey === "proof")!;
    expect(proof.evidenceRequirements[0].minValue).toBe(80); // proof checks the full requirement
  });
});
